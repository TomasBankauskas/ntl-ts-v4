import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'

import { Send, X, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const showAIAssistant = new Store(false)

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
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Ask me anything! I'm here to help.
      </div>
    )
  }

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
      {allMessages.map((message) => (
        <div
          key={message.id}
          className={`py-3 ${
            message.role === 'assistant'
              ? 'bg-gradient-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-2 px-4">
            {message.role === 'assistant' ? (
              <div className="w-6 h-6 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                AI
              </div>
            ) : (
              <div className="w-6 h-6 rounded-lg bg-gray-700 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                Y
              </div>
            )}
            <div className="flex-1 min-w-0 prose dark:prose-invert max-w-none prose-sm">
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
  )
}

export default function AIAssistant() {
  const isOpen = useStore(showAIAssistant)
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

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: currentInput.trim(),
      }

      setMessages((prev) => [...prev, userMessage])

      try {
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

  return (
    <div className="relative z-50">
      <button
        onClick={() => showAIAssistant.setState((state) => !state)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-white hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center text-xs font-medium">
            AI
          </div>
          <span className="font-medium">AI Assistant</span>
        </div>
        <ChevronRight className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute bottom-0 left-full ml-2 w-[700px] h-[600px] bg-gray-900 rounded-lg shadow-xl border border-orange-500/20 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
            <h3 className="font-semibold text-white">AI Assistant</h3>
            <button
              onClick={() => showAIAssistant.setState((state) => !state)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Messages messages={messages} pendingMessage={pendingMessage} />

          <div className="p-3 border-t border-orange-500/20">
            <form onSubmit={handleSubmit}>
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-3 pr-10 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden"
                  rows={1}
                  style={{ minHeight: '36px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height =
                      Math.min(target.scrollHeight, 120) + 'px'
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
