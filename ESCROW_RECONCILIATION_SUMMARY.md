# Escrow Data-Fetching Reconciliation: Executive Summary

**Issue #208**: Two parallel escrow data-fetching stacks (Apollo/GraphQL vs TanStack Query) with independent caches risk inconsistency.

**Finding**: ✅ **The stacks are intentionally separate and currently well-segregated. No urgent fix needed, but explicit documentation will prevent future confusion.**

---

## Key Finding

The two stacks serve **fundamentally different data sources**:

| Aspect | Apollo/GraphQL | TanStack Query |
|--------|---|---|
| **Data Source** | Hasura (app backend DB) | Trustless Work Indexer (blockchain state) |
| **Purpose** | App-side metadata & visibility | On-chain escrow operations |
| **Scope** | escrow_transactions table records | Blockchain escrow contracts |
| **Used By** | Admin views, activity feeds, status watches | User workflows, fund transfers, disputes |
| **Cache Type** | Apollo InMemoryCache | TanStack Query QueryClient |
| **Update Trigger** | GraphQL subscriptions | On-chain transactions + manual invalidation |

**Result**: They're not competing caches for the same data—they're caches for different data.

---

## Audit Results

✅ **No components currently mix both stacks**
- Verified: 50+ component files scanned
- Result: Every escrow component uses ONE stack, never both

✅ **Responsibilities are already de facto segregated**
- Apollo-only: EscrowList, ActivityFeed, RealTimeEscrowStatus, CacheWarmer
- TanStack-only: WalletEscrowDashboard, all tw-blocks operation components

⚠️ **Missing: Explicit documentation**
- No clear comments explaining the split
- No architecture diagram linking them to data sources
- No PR checklist to prevent future mixing

---

## The Real Risk

**Scenario**: A developer adds a new component and queries both stacks thinking they fetch the same data.

**Outcome**: 
1. Component shows escrow from Apollo (stale Hasura state)
2. User performs action through TanStack mutation (fund, approve, etc.)
3. TanStack cache updates ✓
4. Apollo cache might show old state until subscription fires
5. User sees inconsistent UI

**Likelihood**: 🟡 **Medium** (will happen if left undocumented)  
**Severity**: 🟡 **Medium** (confuses user but doesn't break functionality)

---

## Recommended Action: Option 1 (Implement & Document)

Document the split as intentional and enforce it via:

1. **Add code comments** (15 min)
   - Each escrow-related file gets a clear explanation of which stack it is and why
   - Import statements reference this documentation

2. **Create a component matrix** (5 min)
   - Public reference showing which component uses which stack
   - Makes it obvious if someone needs to add a new one

3. **Add PR checklist** (5 min)
   - Template.md includes: "Escrow data stack: not mixing Apollo + TanStack in same component"

4. **Update architecture docs** (10 min)
   - README explains why two stacks exist
   - Links to decision documents

5. **Optional: Add lint check** (30 min)
   - Automated guard against mixing imports in same file

**Total effort**: 35–65 minutes  
**Payoff**: Prevents future confusion; makes stack responsibilities crystal clear

---

## Alternative Actions (Not Recommended Right Now)

### Option 2: Converge on TanStack Query
- **Rationale**: Blockchain is source-of-truth; don't maintain Hasura escrow table
- **Effort**: 2–3 days (refactor all Apollo → TanStack, remove Hasura sync)
- **Trade-off**: Trustless Work Indexer becomes critical dependency; no app-side audit trail

### Option 3: Converge on Apollo
- **Rationale**: App controls workflow; blockchain is just execution
- **Effort**: 2–3 days (implement Hasura←→blockchain sync, refactor TanStack → Apollo)
- **Trade-off**: Adds latency; Hasura state can lag blockchain reality

**Why not now**: Both stacks are working, segregated, and shipping. Convergence is a refactor for later when one becomes clearly insufficient.

---

## Implementation Plan

### Immediate (This Week)
- [ ] Tech lead reviews [ESCROW_DATA_FETCHING_RECONCILIATION.md](./ESCROW_DATA_FETCHING_RECONCILIATION.md)
- [ ] Team agrees on Option 1 approach
- [ ] Assign someone to implement Phase 1–3 (comments, matrix, checklist) = ~30 min

### Short Term (Next Sprint)
- [ ] Phase 5: Update main README with escrow stack section
- [ ] Optional Phase 4: Add lint/CI check if tooling supports it
- [ ] Code review next escrow-related PR using new checklist

### Long Term (Future)
- [ ] Monitor: Do devs understand the split?
- [ ] If Option 2/3 becomes necessary, decision docs are ready

---

## Deliverables Created

1. **[ESCROW_DATA_FETCHING_RECONCILIATION.md](./ESCROW_DATA_FETCHING_RECONCILIATION.md)**
   - Full analysis of both stacks
   - Detailed component mapping
   - Three options with trade-offs

2. **[ESCROW_STACK_IMPLEMENTATION_GUIDE.md](./ESCROW_STACK_IMPLEMENTATION_GUIDE.md)**
   - Step-by-step implementation for Option 1
   - Code comments and documentation templates
   - Checklist and effort estimates

3. **This summary**
   - Quick executive overview
   - Risk assessment and recommendation
   - Implementation timeline

---

## Who Needs to Read What

| Role | Read First | Then |
|------|---|---|
| **Architect/Tech Lead** | This summary | ESCROW_DATA_FETCHING_RECONCILIATION.md |
| **Frontend Engineer (working on escrows)** | ESCROW_STACK_IMPLEMENTATION_GUIDE.md | The components' code comments |
| **Code Reviewer** | ESCROW_COMPONENT_STACK_MATRIX.md | Add checklist to PR reviews |
| **Developer new to project** | README escrow section + this summary | Component matrix as reference |

---

## Questions?

- **"Should we consolidate?"** → Not now. Document first; consolidate if one stack proves insufficient.
- **"Why not deprecate Apollo escrows?"** → Hasura records are useful for admin visibility and audit trails. Blockchain is async; app needs metadata.
- **"Will this impact performance?"** → No. Two caches are as efficient as one. The split is logical, not a performance problem.
- **"What if we add a third data source?"** → This documentation pattern scales. Add it to the matrix and follow the same rules.

---

## Sign-Off

**Recommended**: Implement Option 1 (document + enforce)  
**Effort**: ~1 hour  
**Impact**: Clear responsibilities, no future confusion, reversible (can still converge later)  

**Ready to implement?** → See [ESCROW_STACK_IMPLEMENTATION_GUIDE.md](./ESCROW_STACK_IMPLEMENTATION_GUIDE.md) Phase 1
