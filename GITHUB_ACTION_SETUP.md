# GitHub Action Setup Guide

## Required Environment Variables

### In Vercel Dashboard:
1. Go to your project settings
2. Navigate to Environment Variables
3. Add the following:

```
GITHUB_TOKEN=ghp_your_github_token_here
```

### How to get GitHub Token:
1. Go to GitHub.com → Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Give it a name like "Pokemon TCG Watchlist"
4. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
5. Copy the token and add it to Vercel

## How It Works

### Architecture:
```
Vercel Cron (6 AM) → GitHub Action Trigger → Smart Batcher → Database
```

### Process:
1. **Vercel Cron** runs daily at 6 AM UTC
2. **Trigger API** calls GitHub API to start workflow
3. **GitHub Action** runs for up to 6 hours
4. **Smart Batcher** processes cards in small batches
5. **Rate Limiting** prevents overwhelming target sites

### Configuration:
- **Batch Size**: 5 cards per batch (configurable)
- **Delay**: 2 minutes between batches (configurable)
- **Timeout**: 6 hours maximum
- **Retry**: Built-in GitHub Actions retry

## Testing

### Manual Trigger:
```bash
# Test the trigger API
curl -X GET "https://your-app.vercel.app/api/trigger-github-action"

# Test with custom parameters
curl -X POST "https://your-app.vercel.app/api/trigger-github-action" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 3, "delay_minutes": 1}'
```

### Monitor Progress:
1. Go to your GitHub repository
2. Click "Actions" tab
3. Look for "Daily Card Refresh" workflow
4. Click on the latest run to see logs

## Benefits

✅ **Scalable**: Can handle 1000+ cards  
✅ **Free**: GitHub Actions are free for public repos  
✅ **Reliable**: 6-hour timeout, built-in retries  
✅ **Respectful**: Rate-limited, won't overwhelm sites  
✅ **Monitorable**: GitHub Actions dashboard  
✅ **Maintainable**: Simple, understandable code  

## Troubleshooting

### Common Issues:

1. **GitHub Token Invalid**:
   - Check token has correct permissions
   - Ensure token is not expired

2. **Workflow Not Triggering**:
   - Check Vercel logs for trigger API errors
   - Verify repository name in trigger API

3. **Cards Not Updating**:
   - Check GitHub Action logs
   - Verify database connection
   - Check scraping function errors

4. **Rate Limiting**:
   - Increase delay between batches
   - Reduce batch size
   - Check target site rate limits

### Logs Location:
- **Vercel**: Function logs in dashboard
- **GitHub**: Actions tab → Workflow runs
- **Local**: `logs/` directory in repository
