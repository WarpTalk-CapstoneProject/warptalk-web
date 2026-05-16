export default function JoinMeetingPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8 border rounded-lg shadow-sm">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Join a Meeting</h2>
          <p className="text-muted-foreground mt-2">Enter your meeting code to join the translation room.</p>
        </div>
        <form className="mt-8 space-y-6">
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="meeting-code" className="sr-only">Meeting Code</label>
              <input
                id="meeting-code"
                name="code"
                type="text"
                required
                className="relative block w-full rounded-md border-0 py-2.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3"
                placeholder="Meeting Code (e.g., ABC-123)"
              />
            </div>
            <div>
              <label htmlFor="display-name" className="sr-only">Display Name</label>
              <input
                id="display-name"
                name="name"
                type="text"
                required
                className="relative block w-full rounded-md border-0 py-2.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3"
                placeholder="Your Name"
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              className="flex w-full justify-center rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Join Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
