export default function CallbackDone() {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-xl font-semibold">You’re signed in ✅</h1>
      <p className="text-sm text-gray-600">Taking you to the dashboard…</p>
      <meta httpEquiv="refresh" content="1; url=/" />
    </div>
  );
}
