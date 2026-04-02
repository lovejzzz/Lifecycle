/**
 * CID Chat Command Router — pure function that classifies a user prompt
 * into a command route. Mirrors the routing logic in CIDPanel.tsx.
 *
 * This exists so we can benchmark routing accuracy without a React component.
 */

export type CommandRoute =
  | 'template' // /template <name>
  | 'extend' // add/extend/expand (when workflow exists)
  | 'generate' // build/create/make/generate
  | 'solve' // solve/fix/diagnose
  | 'status' // status/report/health/dashboard
  | 'propagate' // propagate/sync/refresh stale/update stale/run stale
  | 'layout' // layout/arrange
  | 'optimize' // optimize
  | 'approve-all' // approve all
  | 'unlock-all' // unlock all
  | 'activate-all' // activate all
  | 'connect' // connect X to Y
  | 'disconnect' // disconnect X from Y
  | 'delete' // delete/remove <name>
  | 'rename' // rename X to Y
  | 'show-stale' // show stale / show me what's stale
  | 'focus' // focus/select/show/go to <name>
  | 'duplicate' // duplicate/clone/copy <name>
  | 'add-node' // add <category> called <name>
  | 'set-status' // set X to <status> / lock X / unlock X
  | 'list' // list <category|status|all>
  | 'describe' // describe X as Y
  | 'swap' // swap X and Y
  | 'content' // content X: text
  | 'download' // download/export node
  | 'undo' // undo
  | 'redo' // redo
  | 'group' // group by category
  | 'clear-stale' // clear stale
  | 'orphans' // orphans
  | 'count' // count/stats
  | 'merge' // merge X and Y
  | 'deps' // deps/dependencies <name>
  | 'reverse' // reverse <name>
  | 'save-template' // save template <name>
  | 'load-template' // load template <name>
  | 'list-templates' // templates
  | 'save-snapshot' // save <name>
  | 'restore-snapshot' // restore <name>
  | 'list-snapshots' // snapshots
  | 'critical-path' // critical path
  | 'isolate' // isolate/subgraph <name>
  | 'summarize' // summarize
  | 'validate' // validate/check/audit
  | 'clone-workflow' // clone workflow
  | 'what-if' // what if / impact / without
  | 'preflight' // preflight / dry run
  | 'retry-failed' // retry failed
  | 'clear-results' // clear results
  | 'diff-last-run' // diff last run
  | 'refresh-node' // refresh/update/regenerate <node name>
  | 'run-workflow' // run workflow / run all
  | 'run-node' // run/execute <node name>
  | 'explain' // explain/trace
  | 'help' // help/commands/?
  | 'why' // why <name>
  | 'relabel' // relabel all
  | 'teach' // teach: <rule>
  | 'forget-rule' // forget <number>
  | 'list-rules' // rules
  | 'progress' // progress
  | 'diff-snapshot' // diff/compare <name>
  | 'batch-where' // batch <status> where <field>=<value>
  | 'plan' // plan / execution plan
  | 'search' // search <term>
  | 'compress' // compress/compact
  | 'bottlenecks' // bottlenecks
  | 'suggest' // suggest / what should I do
  | 'health-detail' // health detail
  | 'auto-describe' // auto-describe
  | 'refine' // refine (note)
  | 'ingest' // ingest/feed source material to CID
  | 'understand' // show CID's understanding of source
  | 'create-artifact' // create <artifact-type> from context
  | 'sync-artifacts' // sync stale artifacts
  | 'diff-artifacts' // preview what sync would change
  | 'show-overrides' // list user overrides
  | 'forget-override' // remove an override
  | 'update-source' // update/change the source material
  | 'add-tool' // add/enable a tool on a node
  | 'set-condition' // set condition on an edge
  | 'configure-retry' // configure retry/fallback for a node
  | 'show-tools' // list tools available / on a node
  | 'llm-fallback'; // anything else → send to LLM

// ─── Confidence Types ────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface RouteResult {
  route: CommandRoute;
  confidence: ConfidenceLevel;
}

// ─── Pattern Registry ────────────────────────────────────────────────────────
// Each entry is a test function + route + explicit confidence level.
// Order matters — first match wins.
// Confidence is semantic (per-pattern), not positional:
//   'high'   — exact or tightly scoped patterns; won't trigger clarification
//   'medium' — variable-content patterns; may trigger clarification if ambiguous
//   'low'    — very broad / NL patterns; almost always needs LLM

type PatternTest = (prompt: string, hasWorkflow: boolean) => boolean;

interface PatternEntry {
  test: PatternTest;
  route: CommandRoute;
  confidence: ConfidenceLevel;
}

const PATTERNS: PatternEntry[] = [];

function addPattern(test: PatternTest, route: CommandRoute, confidence: ConfidenceLevel) {
  PATTERNS.push({ test, route, confidence });
}

// Slash commands
addPattern((s) => /^\/template\s+/i.test(s), 'template', 'high');
addPattern(
  (s) =>
    /^\/clear\s*$/i.test(s) ||
    /^\/new\s*$/i.test(s) ||
    /^\/export\s*$/i.test(s) ||
    /^\/mode\s*$/i.test(s),
  'template',
  'high',
);

// ── Agentic node/edge configuration (MUST come before extend/set-status/list/focus) ──
// Add tool to node: "add web_search tool to Research", "attach a tool to Node X"
addPattern(
  (s) => /^(?:add|attach|assign)\s+(?:a\s+)?(?:\w+\s+)?tool\s+(?:to|on)\s+/i.test(s),
  'add-tool',
  'high',
);
// Show tools: "show tools", "list tools", "tools"
addPattern(
  (s) => /^(?:show|list)\s+(?:(?:available|all)\s+)?tools?\s*$/i.test(s) || /^tools?\s*$/i.test(s),
  'show-tools',
  'high',
);
// Set edge condition: "set condition on edge from X to Y", "add condition for Rubric→Review"
addPattern(
  (s) => /^(?:set|add|configure)\s+(?:a\s+)?(?:condition|guard|filter)\s+(?:on|for|to)\s+/i.test(s),
  'set-condition',
  'high',
);
// Configure retry: "configure retry for Node X", "set up retries on Quiz Bank"
addPattern(
  (s) =>
    /^(?:configure|set\s+up|enable)\s+(?:retry|retries|backoff|fallback)\s+(?:for|on)\s+/i.test(
      s,
    ) || /^(?:retry\s+(?:policy|config(?:ure)?)|set\s+\d+\s+retr(?:y|ies))\s+/i.test(s),
  'configure-retry',
  'high',
);

// Extend vs generate
addPattern(
  (s, hw) => hw && /^(?:add|extend|expand|include|append|insert|also|plus|and also)\b/i.test(s),
  'extend',
  'high',
);
addPattern(
  (s) =>
    /^(?:build|create|generate|set up|design|start)\b/i.test(s) ||
    /^make\s+(?:a|an|me|new|my)\b/i.test(s),
  'generate',
  'high',
);

// Solve
addPattern((s) => /^(?:solve|fix|diagnose?|heal|repair)\b/i.test(s), 'solve', 'high');

// Health detail (MUST come before generic status)
addPattern(
  (s) => /^(?:health\s+detail|health\s+breakdown|detailed?\s+health|health\s+report)\s*$/i.test(s),
  'health-detail',
  'high',
);

// Status
addPattern((s) => /^(?:status|report|health|dashboard)\b/i.test(s), 'status', 'high');
addPattern(
  (s) => /^analyze\s+(?:this\s+)?(?:workflow|graph|nodes?|structure)/i.test(s),
  'status',
  'high',
);

// Propagate
addPattern(
  (s) =>
    /^(?:propagate?|sync|refresh\s*stale|regenerate\s*stale|update\s+(?:all\s+)?stale|run\s+(?:the\s+)?stale)\b/i.test(
      s,
    ),
  'propagate',
  'high',
);
addPattern(
  (s) => /^run\s+(?:everything|all|anything)\s+(?:that(?:'s| is)|which\s+is)\s+stale/i.test(s),
  'propagate',
  'high',
);

// Layout
addPattern((s) => /^(?:layout|arrange|lay\s+out)\b/i.test(s), 'layout', 'high');

// Optimize
addPattern((s) => /^optimi/i.test(s), 'optimize', 'high');

// Batch where (MUST come before batch approve/unlock/activate)
addPattern((s) => /^batch\s+\w+\s+where\s+/i.test(s), 'batch-where', 'high');

// Batch status changes
addPattern((s) => /^(?:approve\s+all|batch\s+approve)\b/i.test(s), 'approve-all', 'high');
addPattern(
  (s) => /^(?:mark|set)\s+(?:all|every\w*)\s+(?:\w+\s+)?(?:as|to)\s+(?:approved|done)\s*$/i.test(s),
  'approve-all',
  'high',
);
addPattern((s) => /^(?:unlock\s+all|batch\s+unlock)\b/i.test(s), 'unlock-all', 'high');
addPattern(
  (s) => /^(?:mark|set)\s+(?:all|every\w*)\s+(?:\w+\s+)?(?:as|to)\s+unlocked\s*$/i.test(s),
  'unlock-all',
  'high',
);
addPattern((s) => /^(?:activate\s+all|batch\s+activate)\b/i.test(s), 'activate-all', 'high');
addPattern(
  (s) => /^(?:mark|set)\s+(?:all|every\w*)\s+(?:\w+\s+)?(?:as|to)\s+active\s*$/i.test(s),
  'activate-all',
  'high',
);

// Connect / disconnect (MUST come before delete)
addPattern(
  (s) => /^(?:connect|link|wire|attach)\s+.+\s+(?:to|with|→|->)\s+/i.test(s),
  'connect',
  'high',
);
addPattern(
  (s) => /^(?:disconnect|unlink|unwire|detach)\s+.+\s+(?:from|and|→|->)\s+/i.test(s),
  'disconnect',
  'high',
);
addPattern(
  (s) =>
    /^(?:remove|break|cut)\s+(?:the\s+)?(?:connection|link|edge)\s+(?:between|from)\s+/i.test(s),
  'disconnect',
  'high',
);

// Delete
addPattern((s) => /^(?:delete|remove|drop|destroy)\s+.+/i.test(s), 'delete', 'high');

// Rename
addPattern(
  (s) => /^(?:rename|change name|relabel)\s+.+\s+(?:to|as|→|->)\s+/i.test(s),
  'rename',
  'high',
);

// Show stale (MUST come before generic focus/show)
addPattern(
  (s) => /^(?:show|find|list)\s+(?:me\s+)?(?:what(?:'s| is)\s+)?stale/i.test(s),
  'show-stale',
  'medium',
);
addPattern((s) => /^(?:show|find|list)\s+stale/i.test(s), 'show-stale', 'medium');
addPattern((s) => /^(?:what|which)\s+nodes?\s+(?:are|is)\s+stale/i.test(s), 'show-stale', 'medium');
addPattern((s) => /^how\s+many\s+(?:nodes?\s+)?(?:are\s+)?stale/i.test(s), 'show-stale', 'medium');

// "show me the critical path" / "show me bottlenecks" / "show me orphan nodes"
addPattern(
  (s) =>
    /^(?:show|find|what(?:'s| is| are))\s+(?:me\s+)?(?:the\s+)?(?:critical\s*path|longest\s*chain)/i.test(
      s,
    ),
  'critical-path',
  'medium',
);
addPattern(
  (s) =>
    /^(?:show|find|what(?:'s| is| are))\s+(?:me\s+)?(?:the\s+)?(?:bottleneck|chokepoint|hub|spof)/i.test(
      s,
    ),
  'bottlenecks',
  'medium',
);
addPattern(
  (s) => /^(?:show|find|list)\s+(?:me\s+)?(?:the\s+)?(?:orphan|unconnected|isolat)\w*/i.test(s),
  'orphans',
  'medium',
);

// Focus / select / show <node>
addPattern(
  (s) => /^(?:focus|select|show|go to|find|zoom)\s+(?:on\s+)?["']?.+["']?\s*$/i.test(s),
  'focus',
  'medium',
);

// Clone workflow (MUST come before duplicate)
addPattern(
  (s) => /^(?:clone|duplicate)\s+(?:workflow|graph|project|all)\s*$/i.test(s),
  'clone-workflow',
  'high',
);

// Duplicate
addPattern((s) => /^(?:duplicate|clone|copy)\s+["']?.+["']?\s*$/i.test(s), 'duplicate', 'medium');

// Add node by name
addPattern(
  (s) =>
    /^(?:add|new)\s+\w+\s+(?:called|named|:)\s+/i.test(s) ||
    /^(?:add|new)\s+\w+\s+["'].+["']/i.test(s),
  'add-node',
  'high',
);

// Set status / lock / unlock
addPattern(
  (s) =>
    /^(?:set|mark|change)\s+.+\s+(?:to|as|→)\s+\w+\s*$/i.test(s) ||
    /^lock\s+["']?.+["']?\s*$/i.test(s) ||
    /^unlock\s+["']?.+["']?\s*$/i.test(s),
  'set-status',
  'medium',
);

// List
addPattern((s) => /^(?:list|show|inventory)\s+/i.test(s), 'list', 'medium');

// Describe
addPattern(
  (s) => /^(?:describe|annotate|document)\s+.+\s+(?:as:?|:)\s+/i.test(s),
  'describe',
  'high',
);

// Swap
addPattern((s) => /^(?:swap|switch|exchange)\s+.+\s+(?:and|with|↔)\s+/i.test(s), 'swap', 'high');

// Content
addPattern((s) => /^(?:content|write|fill)\s+.+(?::|=)\s+/i.test(s), 'content', 'high');

// Download
addPattern((s) => /^(?:download|export\s+node)\s+/i.test(s), 'download', 'high');

// Undo / redo
addPattern((s) => /^undo\s*$/i.test(s), 'undo', 'high');
addPattern((s) => /^redo\s*$/i.test(s), 'redo', 'high');

// Group
addPattern(
  (s) => /^(?:group|cluster|organize)\s*(?:by\s*)?(?:category|type)?\s*$/i.test(s),
  'group',
  'high',
);

// Clear stale
addPattern((s) => /^(?:clear|purge|remove)\s+stale\s*$/i.test(s), 'clear-stale', 'high');

// Orphans
addPattern((s) => /^(?:orphan|isolat|unconnected)\w*\s*$/i.test(s), 'orphans', 'medium');

// Count
addPattern((s) => /^(?:count|stats|statistics|tally)\s*$/i.test(s), 'count', 'high');

// Merge
addPattern(
  (s) => /^(?:merge|combine|fuse)\s+.+\s+(?:and|with|into|&)\s+/i.test(s),
  'merge',
  'high',
);

// Deps
addPattern(
  (s) => /^(?:deps|dependencies|depend|upstream|downstream|chain)\s+/i.test(s),
  'deps',
  'medium',
);
addPattern(
  (s) => /^what(?:'s| is)\s+(?:blocking|preventing|stopping)\s+.+\s+(?:from|to)\s+/i.test(s),
  'deps',
  'medium',
);
addPattern(
  (s) =>
    /^what(?:'s|\s+(?:is|are))?\s+(?:depend(?:s|ent|ing)?|downstream|upstream)\s+(?:on|of|from)\s+/i.test(
      s,
    ),
  'deps',
  'medium',
);
addPattern((s) => /^what\s+depends\s+on\s+/i.test(s), 'deps', 'medium');

// Reverse
addPattern((s) => /^(?:reverse|flip|invert)\s+/i.test(s), 'reverse', 'medium');

// Templates
addPattern((s) => /^save\s+template\s+["']?(.+?)["']?\s*$/i.test(s), 'save-template', 'high');
addPattern(
  (s) => /^(?:load|use)\s+template\s+["']?(.+?)["']?\s*$/i.test(s),
  'load-template',
  'high',
);
addPattern((s) => /^(?:templates?|my\s+templates?)\s*$/i.test(s), 'list-templates', 'high');

// Snapshots
addPattern((s) => /^(?:save|snapshot)\s+["']?(.+?)["']?\s*$/i.test(s), 'save-snapshot', 'medium');
addPattern((s) => /^(?:restore|load)\s+["']?(.+?)["']?\s*$/i.test(s), 'restore-snapshot', 'medium');
addPattern((s) => /^(?:snapshots?|saved|bookmarks?)\s*$/i.test(s), 'list-snapshots', 'high');

// Critical path
addPattern(
  (s) => /^(?:critical\s*path|longest\s*chain|bottleneck)\s*$/i.test(s),
  'critical-path',
  'high',
);

// Isolate
addPattern(
  (s) => /^(?:isolate|subgraph|neighborhood|neighbours?)\s+/i.test(s),
  'isolate',
  'medium',
);

// Summarize
addPattern(
  (s) =>
    /^(?:summarize|summary|executive|brief|overview)(?:\s+(?:the\s+)?(?:workflow|graph|project|all))?\s*$/i.test(
      s,
    ),
  'summarize',
  'high',
);

// Validate
addPattern(
  (s) =>
    /^(?:validate|integrity|check|audit)(?:\s+(?:the\s+)?(?:workflow|graph|project|all))?\s*$/i.test(
      s,
    ),
  'validate',
  'high',
);

// What if
addPattern((s) => /^(?:what\s*if|impact|without)\b/i.test(s), 'what-if', 'high');

// Preflight
addPattern(
  (s) => /^(?:pre\s*flight|flight\s*check|dry\s*run|plan\s+run|execution\s+plan)\b/i.test(s),
  'preflight',
  'high',
);
addPattern(
  (s) =>
    /^(?:which|what)\s+nodes?\s+(?:are|is)\s+(?:ready|able|eligible)\s+(?:to\s+)?(?:run|execute)/i.test(
      s,
    ),
  'preflight',
  'medium',
);

// Retry failed
addPattern(
  (s) => /^(?:retry|rerun|re-run)\s+(?:failed|errors?|skipped)\s*$/i.test(s),
  'retry-failed',
  'high',
);

// Clear results
addPattern(
  (s) => /^(?:clear|reset)\s+(?:results?|execution|output)\s*$/i.test(s),
  'clear-results',
  'high',
);

// Diff last run
addPattern(
  (s) => /^(?:diff\s+(?:last|prev(?:ious)?)|compare\s+(?:run|execution)s?)\s*$/i.test(s),
  'diff-last-run',
  'high',
);

// Refresh / update / regenerate specific node (MUST come before run-workflow/run-node)
addPattern(
  (s) => /^(?:refresh|update|regenerate)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i.test(s),
  'refresh-node',
  'medium',
);

// Run workflow
addPattern(
  (s) => /^(?:run|execute|start)\s+(?:workflow|all|pipeline|everything)\s*$/i.test(s),
  'run-workflow',
  'high',
);

// Run specific node
addPattern((s) => /^(?:run|execute)\s+["']?(.+?)["']?\s*$/i.test(s), 'run-node', 'medium');

// Explain
addPattern((s) => /^(?:explain|walk\s*through|narrate|trace)\b/i.test(s), 'explain', 'high');

// Help
addPattern((s) => /^(?:help|commands|\?|what can you do)\s*$/i.test(s), 'help', 'high');

// Why <node name> — but NOT "why is...", "why does..." (those go to LLM)
addPattern(
  (s) =>
    /^(?:why|reason|purpose)\s+/i.test(s) &&
    !/^why\s+(?:is|does|do|are|was|were|can|should|would|has|have|did)\b/i.test(s),
  'why',
  'medium',
);

// Relabel
addPattern(
  (s) => /^(?:relabel|re-label|fix\s+labels?|infer\s+labels?)\s*(?:all|edges?)?\s*$/i.test(s),
  'relabel',
  'high',
);

// Teach / rules
addPattern((s) => /^(?:teach|learn|remember)\s*:\s*(.+)$/i.test(s), 'teach', 'high');
addPattern((s) => /^(?:forget|unlearn|remove rule)\s+(\d+)\s*$/i.test(s), 'forget-rule', 'high');
addPattern((s) => /^(?:rules?|taught|learned)\s*$/i.test(s), 'list-rules', 'high');

// Progress
addPattern((s) => /^(?:progress|completion)\s*$/i.test(s), 'progress', 'high');

// Diff snapshot
addPattern((s) => /^(?:diff|compare)\s+["']?(.+?)["']?\s*$/i.test(s), 'diff-snapshot', 'medium');

// Plan
addPattern((s) => /^(?:plan|execution\s*plan|steps|order)\s*$/i.test(s), 'plan', 'high');
addPattern((s) => /^what(?:'s|\s+is)\s+the\s+(?:execution\s+)?order/i.test(s), 'plan', 'medium');

// Search
addPattern((s) => /^(?:search|find|grep)\s+(.+)$/i.test(s), 'search', 'medium');

// Compress
addPattern(
  (s) =>
    /^(?:compress|compact|simplify|dedupe|dedup)(?:\s+(?:the\s+)?(?:workflow|graph|project|all|nodes))?\s*$/i.test(
      s,
    ),
  'compress',
  'high',
);

// Bottlenecks
addPattern(
  (s) => /^(?:bottleneck|bottlenecks|choke|chokepoint|hub|hubs|spof)\s*$/i.test(s),
  'bottlenecks',
  'high',
);

// Suggest
addPattern(
  (s) =>
    /^(?:suggest|next|what\s*(?:should|can)\s*I\s*do(?:\s+next|\s+now)?|recommendations?)\s*$/i.test(
      s,
    ),
  'suggest',
  'medium',
);
addPattern(
  (s) =>
    /^(?:which|what)\s+nodes?\s+(?:need|require|want)\s+(?:attention|work|updating|fixing|help)/i.test(
      s,
    ),
  'suggest',
  'medium',
);
addPattern(
  (s) =>
    /^(?:which|what)\s+nodes?\s+(?:haven't|have\s+not|aren't|are\s+not)\s+been\s+(?:updated|changed|run|executed)/i.test(
      s,
    ),
  'suggest',
  'medium',
);

// Auto-describe
addPattern(
  (s) =>
    /^(?:auto[- ]?describe|describe\s+all|fill\s+descriptions?)(?:\s+(?:all\s+)?(?:nodes?|empty)?)?\s*$/i.test(
      s,
    ),
  'auto-describe',
  'high',
);

// Refine
addPattern(
  (s) => /^(?:refine|extract|structure)(?:\s+(?:this\s+)?note)?\s*$/i.test(s),
  'refine',
  'high',
);

// ── Central Brain Commands ──
addPattern(
  (s) =>
    /^(?:ingest|feed|analyze|here(?:'s| is) (?:my|the|some)|take this|source(?:\s*material)?:)/i.test(
      s,
    ),
  'ingest',
  'medium',
);
addPattern(
  (s) =>
    /^(?:understand(?:ing)?|what do you (?:know|understand)|show (?:me )?(?:your )?(?:understanding|context|source)|context)\s*$/i.test(
      s,
    ),
  'understand',
  'medium',
);
addPattern(
  (s) =>
    /^(?:create|generate|build|make|write)\s+(?:a\s+)?(?:new\s+)?(?:blog[\s-]?post|email|social[\s-]?(?:thread|post|media)|twitter[\s-]?thread|x[\s-]?thread|ad[\s-]?copy|press[\s-]?release|landing[\s-]?page|newsletter|product[\s-]?description|linkedin[\s-]?post|ph[\s-]?(?:tagline|copy)|pitch|summary|brief|article|copy)/i.test(
      s,
    ),
  'create-artifact',
  'medium',
);
addPattern(
  (s) => /^(?:sync|sync all|sync stale|sync everything|resync|re-sync)\s*$/i.test(s),
  'sync-artifacts',
  'medium',
);
addPattern((s) => /^sync\s+["']?.+["']?\s*$/i.test(s), 'sync-artifacts', 'medium');
addPattern(
  (s) => /^(?:diff|preview sync|what(?:'s| would) (?:change|sync)|stale artifacts)\s*$/i.test(s),
  'diff-artifacts',
  'medium',
);
addPattern(
  (s) =>
    /^(?:overrides?|show overrides?|list overrides?|my (?:edits|changes|overrides))\s*$/i.test(s),
  'show-overrides',
  'high',
);
addPattern((s) => /^(?:forget|remove|clear)\s+override\b/i.test(s), 'forget-override', 'high');
addPattern(
  (s) => /^(?:update|change|edit|modify)\s+(?:the\s+)?(?:source|input|original|context)\b/i.test(s),
  'update-source',
  'medium',
);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Classify a CID chat prompt into a command route with confidence level.
 * Confidence is semantic (per-pattern), not positional:
 *   'high'   — exact/tightly scoped patterns; the route is unambiguous
 *   'medium' — variable-content patterns; clear intent but accepts broad input
 *   'low'    — LLM fallback (always)
 */
export function classifyRouteWithConfidence(
  prompt: string,
  hasWorkflow: boolean = false,
): RouteResult {
  for (const pattern of PATTERNS) {
    if (pattern.test(prompt, hasWorkflow)) {
      return { route: pattern.route, confidence: pattern.confidence };
    }
  }
  return { route: 'llm-fallback', confidence: 'low' };
}

/**
 * Classify a CID chat prompt into a command route (backward-compatible).
 * Returns just the route string. Drop-in replacement for original classifyRoute.
 */
export function classifyRoute(prompt: string, hasWorkflow: boolean = false): CommandRoute {
  return classifyRouteWithConfidence(prompt, hasWorkflow).route;
}

/**
 * Backward-compatible wrapper that returns just the route string.
 * Alias for classifyRoute — use when existing callers don't need confidence.
 */
export function routePromptCompat(prompt: string, hasWorkflow: boolean = false): CommandRoute {
  return classifyRoute(prompt, hasWorkflow);
}
