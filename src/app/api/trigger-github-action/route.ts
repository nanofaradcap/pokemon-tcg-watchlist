import { NextRequest, NextResponse } from 'next/server'
import { checkApiSecret } from '@/lib/api-auth'

const DEFAULT_BATCH_SIZE = 10
const DEFAULT_DELAY_MINUTES = 2
const DEFAULT_DRY_RUN = false
const DEFAULT_MAX_CARDS = ''

export async function GET(req: NextRequest) {
  const authError = checkApiSecret(req)
  if (authError) return authError

  try {
    console.log('🔄 Triggering GitHub Action for card refresh...')
    
    // GitHub API endpoint to trigger workflow
    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = 'nanofaradcap' // Replace with your GitHub username
    const repoName = 'pokemon-tcg-watchlist'
    const workflowId = 'daily-refresh.yml'
    
    if (!githubToken) {
      console.error('❌ GITHUB_TOKEN environment variable not set')
      return NextResponse.json(
        { 
          success: false, 
          error: 'GitHub token not configured',
          message: 'Please set GITHUB_TOKEN environment variable in Vercel'
        },
        { status: 500 }
      )
    }

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'pokemon-tcg-watchlist'
        },
        body: JSON.stringify({
          ref: 'main', // Branch to run on
          inputs: {
            batch_size: DEFAULT_BATCH_SIZE.toString(),
            delay_minutes: DEFAULT_DELAY_MINUTES.toString(),
            dry_run: DEFAULT_DRY_RUN.toString(),
            max_cards: DEFAULT_MAX_CARDS
          }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Failed to trigger GitHub Action:', response.status, errorText)
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to trigger GitHub Action',
          details: errorText,
          status: response.status
        },
        { status: 500 }
      )
    }

    console.log('✅ GitHub Action triggered successfully')
    return NextResponse.json({
      success: true,
      message: 'GitHub Action triggered successfully',
      workflow: 'weekly-card-refresh',
      repository: `${repoOwner}/${repoName}`,
      timestamp: new Date().toISOString(),
      note: 'Check GitHub Actions tab to monitor progress'
    })

  } catch (error) {
    console.error('❌ Error triggering GitHub Action:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authError = checkApiSecret(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { batch_size, delay_minutes, dry_run, max_cards } = body
    
    console.log('🔄 Triggering GitHub Action with custom parameters...')
    
    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = 'nanofaradcap'
    const repoName = 'pokemon-tcg-watchlist'
    const workflowId = 'daily-refresh.yml'
    
    if (!githubToken) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'GitHub token not configured'
        },
        { status: 500 }
      )
    }

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'pokemon-tcg-watchlist'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            batch_size: batch_size?.toString() || DEFAULT_BATCH_SIZE.toString(),
            delay_minutes: delay_minutes?.toString() || DEFAULT_DELAY_MINUTES.toString(),
            dry_run: dry_run?.toString() || DEFAULT_DRY_RUN.toString(),
            max_cards: max_cards?.toString() || DEFAULT_MAX_CARDS
          }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to trigger GitHub Action',
          details: errorText
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'GitHub Action triggered with custom parameters',
      parameters: {
        batch_size: batch_size || DEFAULT_BATCH_SIZE,
        delay_minutes: delay_minutes || DEFAULT_DELAY_MINUTES,
        dry_run: dry_run || DEFAULT_DRY_RUN,
        max_cards: max_cards || DEFAULT_MAX_CARDS
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
