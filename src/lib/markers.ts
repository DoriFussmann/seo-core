/**
 * TNV section markers in article bodies ("<!-- CMS-INTERNAL:START -->",
 * "<!-- WHERE-THINGS-STAND:END -->", ...). They stay in the HTML, where TNV's
 * scanners read them, but are noise in the markdown served to AI crawlers.
 */
const MARKER = String.raw`<!--\s*[A-Z][A-Z0-9-]*:(?:START|END)\s*-->`;
const MARKER_LINE = new RegExp(String.raw`^[ \t]*${MARKER}[ \t]*(?:\r?\n|$)`, "gm");
const MARKER_INLINE = new RegExp(MARKER, "g");

/** Removes TNV section markers; a marker on its own line takes the line with it. */
export function stripContentMarkers(markdown: string): string {
  return markdown.replace(MARKER_LINE, "").replace(MARKER_INLINE, "");
}
