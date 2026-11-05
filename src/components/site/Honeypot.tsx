/**
 * Spam trap: hidden from people and assistive tech; bots that fill every field
 * get a fake success from the server and nothing is stored.
 */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
