import { createBilibiliAdapter } from "./bilibili/adapter";
import type { Fetcher } from "../services/http/fetcher";
import type { PlatformAdapter } from "../shared/types";

export class PlatformRegistry {
    private readonly adapters: readonly PlatformAdapter[];

    constructor(adapters: readonly PlatformAdapter[]) {
        this.adapters = adapters;
    }

    resolve(url: URL): PlatformAdapter | null {
        return this.adapters.find((adapter) => adapter.matches(url)) ?? null;
    }
}

export function createPlatformRegistry(fetcher: Fetcher): PlatformRegistry {
    return new PlatformRegistry([
        createBilibiliAdapter(fetcher),
    ]);
}
