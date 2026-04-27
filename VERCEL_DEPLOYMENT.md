# 🚀 Vercel Deployment Guide

## Prerequisites
- GitHub account with repository
- Vercel account (free tier available)
- All API keys configured

## Step 1: Prepare Your Repository

Make sure your code is pushed to GitHub:

```bash
git add .
git commit -m "Add Vercel configuration"
git push origin main
```

Files included in setup:
- ✅ `vercel.json` - Vercel configuration
- ✅ `api/index.js` - Serverless function entry point
- ✅ `.vercelignore` - Files to ignore during deployment
- ✅ `server.js` - Local development server (still works)

## Step 2: Connect to Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"**
3. Select **"Import Git Repository"**
4. Paste your GitHub repo URL
5. Click **"Import"**

### Option B: Via Vercel CLI

```bash
npm install -g vercel
vercel
```

## Step 3: Configure Environment Variables

In Vercel Dashboard:

1. Go to your project **Settings** → **Environment Variables**
2. Add these variables:

```
OPEN_ROUTER_API_KEY=sk-or-v1-...
TAVILY_API_KEY=tvly-...
EXA_API_KEY=...
FIRE_CRAWL_API_KEY=fc-...
SERP_API_KEY=...
MODEL=openai/gpt-4o-mini
```

**Each variable:**
- Click **"Add New"**
- Paste the key name and value
- Select **Production** environment
- Click **"Save"**

## Step 4: Deploy

### Via Dashboard
- Push to GitHub → Automatic deployment
- Or click **"Deploy"** button in Vercel dashboard

### Via CLI
```bash
vercel --prod
```

## Step 5: Monitor Deployment

1. **Build Output**: Check if build succeeds
2. **Function Logs**: Vercel Dashboard → **Functions** tab
3. **Analytics**: Monitor API calls and performance

## Important Notes

⚠️ **Session Storage Limitation**
- Currently, sessions are stored in server memory
- On Vercel, each function invocation is independent
- **Solution**: Add Redis for persistent session storage

### To add Redis (Optional):
```bash
npm install redis
```

Update `routes/chat.js` to use Redis instead of Map:
```javascript
import redis from 'redis';
const client = redis.createClient({
  host: process.env.REDIS_URL
});
```

⚠️ **Cold Starts**
- First request might take 5-10 seconds
- Subsequent requests are much faster
- Use Vercel's "Always On" if needed (Pro plan)

⚠️ **Function Timeout**
- Currently set to 60 seconds in `vercel.json`
- Large crawls might timeout
- Increase `maxDuration` if needed (up to 300s on Pro)

## Testing After Deployment

```bash
# Test the deployed API
curl https://your-app.vercel.app/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me diamond rings",
    "sessionId": "test",
    "activeTool": "serper",
    "country": "in"
  }'
```

## Troubleshooting

### Build Fails
- Check **Build Logs** in Vercel Dashboard
- Ensure all dependencies are in `package.json`
- Run `npm install` locally and commit `package-lock.json`

### API Returns 500 Error
- Check **Function Logs** in Vercel Dashboard
- Verify environment variables are set
- Check API key validity

### Sessions Not Persisting
- This is expected with current implementation
- Each request might go to a different function instance
- Solution: Implement Redis or database session storage

### Slow API Responses
- Firecrawl's secondary scraping adds latency
- Consider reducing result count or removing secondary crawl
- Use Vercel Pro for more function concurrency

## Environment Variables in vercel.json

The `vercel.json` file references environment variables with `@` prefix:
- `@open_router_api_key` → Links to `OPEN_ROUTER_API_KEY` in Vercel
- All variables must be added in Vercel Dashboard first

## Local Testing Before Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Test locally with Vercel environment
vercel dev

# This runs on http://localhost:3000
```

## Next Steps

1. ✅ Configure API keys in Vercel Dashboard
2. ✅ Deploy to Vercel
3. ⚠️ Test all search tools (Serper, Exa, Tavily, Firecrawl)
4. ⚠️ Monitor logs for any errors
5. ⚠️ Optimize for cold starts if needed

## Rollback

To rollback to previous version:
- Go to **Deployments** tab
- Click the previous working deployment
- Click **"Promote to Production"**

## Custom Domain

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Update DNS records (instructions provided)

---

**Need Help?**
- [Vercel Docs](https://vercel.com/docs)
- [Express on Vercel](https://vercel.com/guides/deploying-express-with-vercel)
- [Environment Variables](https://vercel.com/docs/projects/environment-variables)
