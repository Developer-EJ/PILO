"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  LoginProviderButtons,
  type LoginProviderButton,
} from "./LoginProviderButtons";
import { authProviderHref } from "./authProviderHref.mjs";
import { resolveWorkspaceLoginNextPath } from "./loginRedirects.mjs";

export type LoginProviderEntry = Omit<LoginProviderButton, "href"> & {
  path: string;
};

type LoginProviderListProps = {
  providers: LoginProviderEntry[];
};

export function LoginProviderList({ providers }: LoginProviderListProps) {
  const searchParams = useSearchParams();
  const rawNextPath = searchParams.get("next");
  const nextPath = useMemo(
    () => resolveWorkspaceLoginNextPath(rawNextPath),
    [rawNextPath],
  );
  const providerButtons = useMemo(
    () =>
      providers.map((provider) => ({
        ...provider,
        href: authProviderHref(provider.path, { next: nextPath }),
      })),
    [nextPath, providers],
  );

  return <LoginProviderButtons providers={providerButtons} />;
}
