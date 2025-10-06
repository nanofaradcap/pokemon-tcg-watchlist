#!/bin/bash

# Pre-deployment check script
echo "🔍 Running pre-deployment checks..."

# Check for TypeScript errors (excluding test files)
echo "📝 Checking TypeScript compilation..."
npx tsc --noEmit --project tsconfig.pre-deploy.json
if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    exit 1
fi
echo "✅ TypeScript compilation passed"

# Check for ESLint errors
echo "🔍 Running ESLint checks..."
npx eslint . --ext .ts,.tsx,.js,.jsx
if [ $? -ne 0 ]; then
    echo "❌ ESLint checks failed"
    exit 1
fi
echo "✅ ESLint checks passed"

# Check for build errors
echo "🏗️  Testing build process..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build test passed"

# Check for any uncommitted changes
echo "📋 Checking for uncommitted changes..."
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Warning: There are uncommitted changes"
    git status --short
else
    echo "✅ No uncommitted changes"
fi

echo "🎉 All pre-deployment checks passed!"
