import { useEffect, useRef, useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import './tanchat.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function InitalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-3xl mx-auto w-full">
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-orange-500 to-red-600 text-transparent bg-clip-text uppercase">
          <span className="text-white">TanStack</span> Chat
        </h1>
        <p className="text-gray-400 mb-6 w-2/3 mx-auto text-lg">
          You can ask me about anything, I might or might not have a good
          answer, but you can still ask.
        </p>
        {children}
      </div>
    </div>
  )
}

function ChattingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-0 right-0 left-64 bg-gray-900/80 backdrop-blur-sm border-t border-orange-500/10">
      <div className="max-w-3xl mx-auto w-full px-4 py-3">{children}</div>
    </div>
  )
}

function Messages({
  messages,
  pendingMessage,
}: {
  messages: Array<Message>
  pendingMessage: Message | null
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages, pendingMessage])

  const allMessages = [...messages, pendingMessage].filter(
    (msg): msg is Message => msg !== null
  )

  if (!allMessages.length) {
    return null
  }

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto pb-24">
      <div className="max-w-3xl mx-auto w-full px-4">
        {allMessages.map((message) => (
          <div
            key={message.id}
            className={`p-4 ${
              message.role === 'assistant'
                ? 'bg-gradient-to-r from-orange-500/5 to-red-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4 max-w-3xl mx-auto w-full">
              {message.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 mt-2 flex items-center justify-center text-sm font-medium text-white flex-shrink-0">
                  AI
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white flex-shrink-0">
                  Y
                </div>
              )}
              <div className="flex-1 min-w-0 prose dark:prose-invert max-w-none">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                  remarkPlugins={[remarkGfm]}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim() || isLoading) return

      const currentInput = input
      setInput('')
      setIsLoading(true)

      // Create user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: currentInput.trim(),
      }

      // Add user message to state
      setMessages((prev) => [...prev, userMessage])

      try {
        // Call API
        const response = await fetch('/demo/api/tanchat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [...messages, userMessage],
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to get response')
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No reader found in response')
        }

        const decoder = new TextDecoder()
        let done = false
        let newMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '',
        }
        let buffer = ''

        while (!done) {
          const result = await reader.read()
          done = result.done

          if (!done && result.value) {
            buffer += decoder.decode(result.value, { stream: true })

            // Split by newlines to get complete JSON objects
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const json = JSON.parse(line)
                  if (json.type === 'content_block_delta' && json.delta?.text) {
                    newMessage = {
                      ...newMessage,
                      content: newMessage.content + json.delta.text,
                    }
                    setPendingMessage({ ...newMessage })
                  }
                } catch (e) {
                  console.error('Error parsing streaming response:', e)
                }
              }
            }
          }
        }

        // Add final message to state
        setPendingMessage(null)
        if (newMessage.content.trim()) {
          setMessages((prev) => [...prev, newMessage])
        }
      } catch (error) {
        console.error('Error in chat:', error)
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            'Sorry, I encountered an error. Please check your API key and try again.',
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
      }
    },
    [input, isLoading, messages]
  )

  const Layout = messages.length ? ChattingLayout : InitalLayout

  return (
    <div className="relative flex h-[calc(100vh-32px)] bg-gray-900">
      <div className="flex-1 flex flex-col">
        <Messages messages={messages} pendingMessage={pendingMessage} />

        <Layout>
          <form onSubmit={handleSubmit}>
            <div className="relative max-w-xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type something clever (or don't, we won't judge)..."
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '200px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height =
                    Math.min(target.scrollHeight, 200) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </Layout>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/demo/tanchat')({
  component: ChatPage,
})
