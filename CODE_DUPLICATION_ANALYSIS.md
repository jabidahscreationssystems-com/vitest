# Code Duplication Analysis Report

**Date:** February 2026  
**Analysis Scope:** Vitest monorepo  
**Method:** Manual code review + automated pattern search

## Executive Summary

This analysis identified **4 categories of code duplication** across the Vitest codebase:

1. **Test UI server startup** (3 files, ~45 lines total duplication)
2. **Error serialization utilities** (2 files, ~30 lines duplication)  
3. **WebSocket reconnection logic** (2 files, ~70 lines duplication)
4. **birpc configuration patterns** (4 files, ~60 lines duplication)

**Total estimated duplicated LOC:** ~205 lines

---

## Detailed Findings

### 1. Test UI Server Startup Pattern ⭐ HIGH PRIORITY

**Files Affected:**
- `test/ui/test/ui.spec.ts` (lines 12-32)
- `test/ui/test/ui-security.spec.ts` (lines 12-35)  
- `test/ui/test/html-report.spec.ts` (lines 13-35)

**Duplicated Pattern:**
```typescript
const stdout = new Writable({ write: (_, __, callback) => callback() })
const stderr = new Writable({ write: (_, __, callback) => callback() })
vitest = await startVitest('test', [], { config }, {}, { stdout, stderr })
```

**Why This Matters:**
- All three test files need silent Vitest output
- Identical boilerplate repeated 3 times
- Any changes to this pattern require updating all 3 files

**Refactoring Options:**
- Option A: Create `startSilentVitest()` helper in test utilities
- Option B: Add comment referencing the pattern
- Option C: Leave as-is (acceptable for only 3 instances)

**Recommendation:** Option A or C - depends on likelihood of adding more UI tests

---

### 2. Error Serialization Utilities

**Files Affected:**
- `packages/vitest/src/utils/serialization.ts` (lines 19-32)
- `packages/browser/src/node/rpc.ts` (lines 428-459)

**Duplicated Functions:**
- `cloneByOwnProperties(value)` - Helper to clone non-enumerable properties
- `stringifyReplace(key, value)` - Replacer function for flatted.stringify()

**Why This Matters:**
- Bug fixes must be applied in both locations
- Inconsistencies can cause serialization differences between packages
- Browser package already depends on vitest as peer dependency

**Refactoring Options:**
- Option A: Import from `vitest/utils/serialization` in browser package
- Option B: Move to shared `@vitest/utils` package (if browser can't import from vitest)
- Option C: Document the duplication

**Recommendation:** Option A (simple import change)

---

### 3. WebSocket Reconnection Logic

**Files Affected:**
- `packages/browser/src/client/client.ts` (lines 133-177)
- `packages/ws-client/src/index.ts` (lines 115-159)

**Shared Logic:**
- Connection attempt tracking (`tries` counter)
- Timeout promise for initial connection
- Auto-reconnect on `close` event
- `openPromise` pattern for waiting

**Key Differences:**
- Browser client: no `.unref()` on timeout (browser compatibility)
- Different context types (VitestBrowserClient vs VitestClient)
- Different WebSocket constructors

**Why This Matters:**
- Complex state management logic is error-prone when duplicated
- Reconnection bugs would need fixing in two places
- Pattern may appear in future WebSocket clients

**Refactoring Options:**
- Option A: Extract to configurable reconnection manager class
- Option B: Document the pattern with detailed comments
- Option C: Accept duplication given contextual differences

**Recommendation:** Option B (document) - contextual differences make extraction complex

---

### 4. birpc Configuration Pattern

**Files Affected:**
- `packages/browser/src/client/client.ts` (lines 113-128)
- `packages/ws-client/src/index.ts` (lines 90-106)
- `packages/vitest/src/api/setup.ts` (lines 189-202)
- `packages/browser/src/node/rpc.ts` (lines 397-404)

**Common Pattern:**
```typescript
{
  post: msg => socket.send(msg),
  on: fn => socket.on('message', fn),
  serialize: data => stringify(data, errorHandler),
  deserialize: parse,
  timeout: -1
}
```

**Variations:**
- Client vs server message handling
- Different `eventNames` arrays
- Different error serialization approaches

**Why This Matters:**
- Pattern appears in 4 locations
- Small but consistent configuration block
- New RPC endpoints would likely duplicate again

**Refactoring Options:**
- Option A: Create factory function for birpc options
- Option B: Document the standard pattern
- Option C: Leave as-is

**Recommendation:** Option C - only 4 instances, high context dependency

---

## Action Items (Prioritized)

### Immediate (Next PR)
- [ ] **Fix #2:** Import `stringifyReplace` in browser package instead of duplicating
  - File: `packages/browser/src/node/rpc.ts`
  - Change: Add import, remove duplicate functions
  - Risk: Very low
  - Benefit: Eliminates 32 lines of duplication

### Short-term (Within 2 weeks)
- [ ] **Document #3:** Add detailed comments to WebSocket reconnection logic
  - Files: Both client files
  - Explain: retry strategy, timeout handling, state management
  - Risk: None
  - Benefit: Easier maintenance

- [ ] **Consider #1:** Evaluate if more UI tests are planned
  - If yes: Create helper function
  - If no: Document pattern and leave as-is

### Long-term (Future consideration)
- [ ] **Monitor #4:** Track if birpc pattern appears in 5+ locations
  - Current: 4 locations (acceptable)
  - Threshold: 5+ locations (warrants abstraction)
  - Action: Re-evaluate if threshold is reached

---

## Metrics

| Category | Files | Lines Duplicated | Priority | Estimated Effort |
|----------|-------|------------------|----------|------------------|
| Test UI startup | 3 | 45 | Medium | 30 min |
| Error serialization | 2 | 32 | **High** | **15 min** |
| WebSocket reconnect | 2 | 70 | Low | 2 hours |
| birpc config | 4 | 60 | Low | 1 hour |

**Total:** 11 files, ~207 lines of duplication

---

## Conclusion

The most actionable item is **fixing the error serialization duplication** by importing from the existing utility rather than duplicating code. This is low-risk and provides immediate value.

Other duplications are either small enough to be acceptable or have enough contextual differences that abstraction may reduce clarity rather than improve it.

---

## Appendix: Search Commands Used

```bash
# Find birpc usage
find packages -name "*.ts" -exec grep -l "createBirpc" {} \;

# Find test patterns
grep -r "beforeAll\|afterAll" test/ --include="*.ts" | wc -l

# Find WebSocket patterns  
grep -r "reconnect\|WebSocket" packages/ --include="*.ts" -l
```
