import {
  LeaderboardExplorer,
  leaderboardCategories,
} from "@/components/usage/leaderboard-explorer";
import { CatalogNavigation } from "@/components/control-plane/catalog-navigation";

export function LeaderboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <LeaderboardExplorer
        admin
        navigation={
          <CatalogNavigation label="排行榜分类" items={leaderboardCategories} />
        }
      />
    </div>
  );
}
