import { WatchlistWrapper } from "@/components/watchlist-wrapper";
import { ProfilePills } from "@/components/profile-pills";
import { cardService } from "@/lib/card-service";
import { QueryClient, dehydrate } from "@tanstack/react-query";

// Force dynamic rendering to prevent Next.js from caching the page
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const defaultProfiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const;

export default async function Home() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Set staleTime to 30 seconds - data is considered fresh for 30s
        // This prevents immediate refetch on mount when we have hydrated data
        staleTime: 1000 * 30, // 30 seconds
        gcTime: 1000 * 60 * 10,
        retry: 1,
        refetchOnWindowFocus: true,
        // Only refetch on mount if data is stale (older than staleTime)
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  });

  // Prefetch cards data for the default profile (first profile)
  const defaultProfile = defaultProfiles[0];
  let dehydratedState: ReturnType<typeof dehydrate> | null = null;
  
  try {
    // Use a longer timeout for SSR since database queries can take time
    // Client-side fetch takes ~3.7s, so allow up to 8s for SSR
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Prefetch timeout after 8s')), 8000)
    );
    
    const data = await Promise.race([
      cardService.getCardsForProfile(defaultProfile),
      timeoutPromise
    ]) as Awaited<ReturnType<typeof cardService.getCardsForProfile>>;
    
    await queryClient.prefetchQuery({
      queryKey: ['cards', defaultProfile],
      queryFn: () => Promise.resolve(data),
    });
    
    dehydratedState = dehydrate(queryClient);
  } catch {
    // Create empty dehydrated state - client will fetch on mount
    dehydratedState = dehydrate(queryClient);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
                   <h1 className="text-3xl font-bold tracking-tight">Pokémon TCG Watchlist</h1>
        <p className="text-muted-foreground mt-2">
          Track Pokémon card prices from TCGplayer and PriceCharting
        </p>
          </div>
          <ProfilePills />
        </div>
        {/* Wrap Watchlist with HydrationBoundary to provide initial data */}
        <WatchlistWrapper dehydratedState={dehydratedState} />
      </div>
    </div>
  );
}
