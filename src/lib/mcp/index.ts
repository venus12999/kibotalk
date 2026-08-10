import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSessions from "./tools/list-sessions";
import getSession from "./tools/get-session";
import deleteSession from "./tools/delete-session";
import searchEmotions from "./tools/search-emotions";

// The OAuth issuer must be the direct Supabase host; the project ref is the
// only value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "kibotalk",
  title: "KiboTalk",
  version: "0.1.0",
  instructions:
    "Tools for KiboTalk, a real-time conversation coach. Use list_sessions/get_session to read the signed-in user's saved conversation transcripts and summaries, delete_session to remove one, and search_emotions to look up emotion-intelligence response strategies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  // Cast: tools without an outputSchema widen to `undefined`, which trips
  // exactOptionalPropertyTypes even though the runtime shape is correct.
  tools: [listSessions, getSession, deleteSession, searchEmotions] as never,
});
