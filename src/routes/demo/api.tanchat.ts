import { createFileRoute } from '@tanstack/react-router'
import { Anthropic } from '@anthropic-ai/sdk'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are TanStack Chat, an AI assistant using Markdown for clear and structured responses. Format your responses following these guidelines:

1. Use headers for sections:
   # For main topics
   ## For subtopics
   ### For subsections

2. For lists and steps:
   - Use bullet points for unordered lists
   - Number steps when sequence matters

3. For code:
   - Use inline \`code\` for short snippets
   - Use triple backticks with language for blocks:
   \`\`\`python
   def example():
       return "like this"
   \`\`\`

4. For emphasis:
   - Use **bold** for important points
   - Use *italics* for emphasis
   - Use > for important quotes or callouts

5. For structured data:
   | Use | Tables |
   |-----|---------|
   | When | Needed |

6. Break up long responses with:
   - Clear section headers
   - Appropriate spacing between sections
   - Bullet points for better readability
   - Short, focused paragraphs

7. For technical content:
   - Always specify language for code blocks
   - Use inline \`code\` for technical terms
   - Include example usage where helpful

Keep responses concise and well-structured. Use appropriate Markdown formatting to enhance readability and understanding.`

export const Route = createFileRoute('/demo/api/tanchat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = await request.json()

          // Check for API key
          const apiKey = process.env.ANTHROPIC_API_KEY

          if (!apiKey) {
            throw new Error(
              'Missing API key: Please set ANTHROPIC_API_KEY in your environment variables or .env file.'
            )
          }

          // Create Anthropic client
          const anthropic = new Anthropic({
            apiKey,
            timeout: 30000,
          })

          // Filter and format messages
          const formattedMessages = messages
            .filter(
              (msg: Message) =>
                msg.content.trim() !== '' &&
                !msg.content.startsWith('Sorry, I encountered an error')
            )
            .map((msg: Message) => ({
              role: msg.role,
              content: msg.content.trim(),
            }))

          if (formattedMessages.length === 0) {
            return new Response(
              JSON.stringify({ error: 'No valid messages to send' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          // Stream response from Anthropic
          const stream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: formattedMessages,
          })

          // Transform the stream to newline-delimited JSON
          const encoder = new TextEncoder()
          const transformedStream = new ReadableStream({
            async start(controller) {
              try {
                for await (const event of stream) {
                  if (
                    event.type === 'content_block_delta' &&
                    event.delta.type === 'text_delta'
                  ) {
                    const chunk = {
                      type: 'content_block_delta',
                      delta: {
                        type: 'text_delta',
                        text: event.delta.text,
                      },
                    }
                    controller.enqueue(
                      encoder.encode(JSON.stringify(chunk) + '\n')
                    )
                  }
                }
                controller.close()
              } catch (error) {
                console.error('Stream error:', error)
                controller.error(error)
              }
            },
          })

          return new Response(transformedStream, {
            headers: {
              'Content-Type': 'application/x-ndjson',
            },
          })
        } catch (error) {
          console.error('Chat API error:', error)

          let errorMessage = 'Failed to get AI response'
          let statusCode = 500

          if (error instanceof Error) {
            if (error.message.includes('rate limit')) {
              errorMessage =
                'Rate limit exceeded. Please try again in a moment.'
            } else if (
              error.message.includes('Connection error') ||
              error.name === 'APIConnectionError'
            ) {
              errorMessage =
                'Connection to Anthropic API failed. Please check your internet connection and API key.'
              statusCode = 503
            } else if (error.message.includes('authentication')) {
              errorMessage =
                'Authentication failed. Please check your Anthropic API key.'
              statusCode = 401
            } else {
              errorMessage = error.message
            }
          }

          return new Response(
            JSON.stringify({
              error: errorMessage,
              details: error instanceof Error ? error.name : undefined,
            }),
            {
              status: statusCode,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      },
    },
  },
})
