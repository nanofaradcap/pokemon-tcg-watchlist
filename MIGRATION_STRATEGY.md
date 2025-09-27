# Card Merging Migration Strategy

## Overview
This document outlines the migration strategy for adding card merging functionality to the production database.

## Database Changes
The following fields are being added to the `Card` table:
- `mergedWith` (TEXT, nullable) - ID of the card this is merged with
- `isMerged` (BOOLEAN, default false) - Whether this card is part of a merge
- `mergeGroupId` (TEXT, nullable) - Group ID for merged cards (same for all cards in a merge group)

## Migration Steps

### 1. Development Testing ✅
- [x] Schema changes applied to local SQLite database
- [x] Card merging functionality tested with TCGplayer and PriceCharting cards
- [x] Merging logic verified to work correctly

### 2. Production Migration
The migration file `20250927040000_add_card_merging_fields/migration.sql` contains:

```sql
-- Add merging fields to Card table
ALTER TABLE "Card" ADD COLUMN "mergedWith" TEXT;
ALTER TABLE "Card" ADD COLUMN "isMerged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mergeGroupId" TEXT;
```

### 3. Deployment Steps

1. **Backup Production Database**
   ```bash
   # Create backup before migration
   pg_dump $DATABASE_URL > backup_before_merging_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Deploy Migration**
   ```bash
   # Apply migration to production
   npx prisma migrate deploy
   ```

3. **Verify Migration**
   ```bash
   # Check that new columns exist
   npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'Card' AND column_name IN ('mergedWith', 'isMerged', 'mergeGroupId');"
   ```

4. **Deploy Application**
   ```bash
   # Deploy the updated application
   npx vercel --prod
   ```

### 4. Post-Migration Testing

1. **Test Card Addition**
   - Add a TCGplayer card
   - Add the corresponding PriceCharting card
   - Verify they merge automatically

2. **Test Merged Data Display**
   - Verify merged cards show data from both sources
   - Check that `mergedUrls` and `mergedSources` are populated

3. **Test Unmerge Functionality**
   - Test unmerging cards via API
   - Verify cards become separate again

## Rollback Plan

If issues arise, the migration can be rolled back:

```sql
-- Remove merging fields (WARNING: This will lose merge data)
ALTER TABLE "Card" DROP COLUMN "mergedWith";
ALTER TABLE "Card" DROP COLUMN "isMerged";
ALTER TABLE "Card" DROP COLUMN "mergeGroupId";
```

## Risk Assessment

**Low Risk**: 
- New fields are nullable with safe defaults
- No existing data is modified
- Application gracefully handles both merged and non-merged cards

**Mitigation**:
- Thorough testing in development
- Database backup before migration
- Gradual rollout with monitoring

## Monitoring

After deployment, monitor:
- Card addition success rates
- Merge detection accuracy
- API response times
- Error rates in logs

## Future Enhancements

- UI improvements for merged card display
- Bulk merge/unmerge operations
- Merge conflict resolution
- Advanced matching algorithms
