# Preview Markdown in Assistant Chat Messages

## Context

The agent's replies in `simple-chatapp/client` are plain natural-language/markdown text, but the UI currently renders them as raw text — headings, bold text, lists, and any tables the stock bot returns show up with literal `#`, `**`, `-`, `|` characters instead of being formatted. This makes agent responses (especially structured ones like stock summaries) harder to read. We're adding a markdown renderer so assistant messages display as formatted markdown, matching a standard chat-app UX.

## Approach

Use **`react-markdown`** with the **`remark-gfm`** plugin:
- `react-markdown` renders markdown to real React elements (not `dangerouslySetInnerHTML`), so it's safe by default — no raw HTML injection risk from agent output.
- `remark-gfm` adds GitHub-flavored markdown: tables, strikethrough, task lists — useful since the stock bot may return tabular inventory/zeroization data.
- No syntax-highlighting plugin for now (this agent's toolset is stock operations, not code generation) — plain `<pre>`/`<code>` styling via Tailwind covers any code blocks that do appear. Can add `rehype-highlight` later without restructuring.
- Markdown rendering applies to **assistant messages only**. User-typed messages keep the current plain-text rendering (`whitespace-pre-wrap`) — this is the standard pattern and avoids reformatting text users didn't intend as markdown.

## Changes

### 1. Add dependencies
In `simple-chatapp/package.json`:
```bash
cd simple-chatapp
npm install react-markdown remark-gfm
```

### 2. Update `simple-chatapp/client/components/ChatWindow.tsx`

In `MessageBubble` (lines 73–89), replace the plain `<p>` rendering for assistant messages with `ReactMarkdown`, keeping user messages as-is:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="md-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3. Styling for rendered markdown

The project already uses Tailwind. Rather than pull in `@tailwindcss/typography` for one component, add minimal targeted styles for the elements markdown actually produces (headings, lists, code, tables, links) scoped under a `.md-content` class in `simple-chatapp/client/globals.css`. This keeps the diff small and avoids a Tailwind plugin dependency just for chat bubbles. Cover: paragraph spacing, `ul`/`ol` indentation, `code`/`pre` monospace+background, `table`/`th`/`td` borders, and link color matching the existing blue accent (`text-blue-600`).

## Verification

1. `cd simple-chatapp && npm install` to pull in the new deps.
2. `npm run dev`, log in, open a chat.
3. Send a message that prompts the agent to respond with markdown (e.g. ask it to list stock levels across a few products, or ask "explain this in a bulleted list with a table") and confirm:
   - Bullet/numbered lists render as actual lists, not literal `-`/`1.` text.
   - Bold/italic/headings render styled, not with literal `**`/`#`.
   - A GFM table (if the agent produces one) renders as a bordered table.
   - Inline code / fenced code blocks render in monospace with a background.
4. Confirm user-typed messages still render as plain text (send a message containing `**test**` as the user and verify it shows literally, unformatted).
5. Confirm `tool_use` blocks (`ToolUseBlock`) are unaffected — they still show raw JSON in `<pre>`.
