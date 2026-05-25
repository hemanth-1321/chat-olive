import ReactMarkdown from 'react-markdown'
import { useStreamingText } from '@/hooks/useStreamingText'

interface Props {
  content: string
  isStreaming: boolean
}

export function StreamingMessage({ content, isStreaming }: Props) {
  const displayed = useStreamingText(content, isStreaming)

  return (
    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown>{displayed}</ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse ml-1" />
      )}
    </div>
  )
}
