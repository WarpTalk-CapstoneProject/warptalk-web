export default function AiChatPage() {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Chat with AI</h1>
        <p className="text-muted-foreground">
          Ask questions about past meetings. The AI will retrieve the context and provide answers.
        </p>
      </div>
      
      <div className="flex-1 border rounded-lg flex flex-col bg-background">
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto space-y-4 opacity-50">
            <h3 className="text-lg font-medium">Start a conversation</h3>
            <p className="text-sm text-muted-foreground">
              Example: &quot;What were the key deliverables discussed in yesterday&apos;s sync?&quot;
            </p>
          </div>
        </div>
        
        <div className="p-4 border-t bg-muted/30">
          <div className="flex gap-4">
            <input 
              type="text" 
              placeholder="Ask anything about your meetings..." 
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
