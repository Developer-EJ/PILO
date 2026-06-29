"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createAuthClient } from "../../lib/auth/authClient.mjs";
import {
  LoginProviderButtons,
  type LoginProviderButton,
} from "./LoginProviderButtons";
import { authProviderHref } from "./authProviderHref.mjs";

export type LoginProviderEntry = Omit<LoginProviderButton, "href"> & {
  id: string;
  path: string;
  callbackPath?: string;
};

type LoginProviderListProps = {
  providers: LoginProviderEntry[];
};

export function LoginProviderList({ providers }: LoginProviderListProps) {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const [resolvedProviders, setResolvedProviders] = useState(providers);

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      const authClient = createAuthClient();
      const providerResponse = await authClient.getAuthProviders();
      const providersById = new Map(
        providerResponse.providers.map((provider) => [provider.id, provider]),
      );

      if (cancelled) return;

      setResolvedProviders(
        providers.map((provider) => {
          const providerSummary = providersById.get(provider.id);

          if (!providerSummary) {
            return provider;
          }

          return {
            ...provider,
            name: providerSummary.label || provider.name,
            path: providerSummary.startPath || provider.path,
            callbackPath: providerSummary.callbackPath,
          };
        }),
      );
    }

    loadProviders().catch(() => {
      if (!cancelled) {
        setResolvedProviders(providers);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [providers]);

  const providerButtons = useMemo(
    () =>
      resolvedProviders.map((provider) => ({
        ...provider,
        href: authProviderHref(provider.path, { next: nextPath }),
      })),
    [nextPath, resolvedProviders],
  );

  return <LoginProviderButtons providers={providerButtons} />;
}
