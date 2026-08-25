export default function Loading() {
  return (
    <div className="fixed inset-x-0 top-0 z-[2147483647] h-[3px] overflow-hidden">
      <div className="h-full w-full origin-left animate-[page-loading-bar_1.2s_ease-in-out_infinite] bg-foreground" />
      <span className="sr-only">Loading page</span>
      <style>{`
        @keyframes page-loading-bar {
          0% {
            transform: translateX(-100%) scaleX(0.35);
          }
          45% {
            transform: translateX(-10%) scaleX(0.7);
          }
          100% {
            transform: translateX(100%) scaleX(0.35);
          }
        }
      `}</style>
    </div>
  );
}
