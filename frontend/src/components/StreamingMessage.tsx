import ReactMarkdown from 'react-markdown'

interface Props {
  content: string
  isStreaming: boolean
}

export function StreamingMessage({ content, isStreaming }: Props) {
  if (isStreaming && !content) {
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce [animation-delay:300ms]" />
      </div>
    )
  }

  return (
    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <div className={isStreaming ? 'streaming-text' : ''}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-primary/70 animate-blink ml-0.5 -mb-0.5 rounded-sm" />
      )}
    </div>
  )
}
