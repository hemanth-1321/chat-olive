import ReactMarkdown from 'react-markdown'

interface Props {
  content: string
  isStreaming: boolean
}

export function StreamingMessage({ content, isStreaming }: Props) {
  return (
    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <div className={isStreaming ? 'animate-fade-in-tokens' : ''}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {isStreaming && (
        <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse ml-1" />
      )}
    </div>
  )
}
