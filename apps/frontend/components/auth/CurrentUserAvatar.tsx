"use client";

import { useEffect, useMemo, useState } from "react";
import { createAuthClient } from "../../lib/auth/authClient.mjs";

type CurrentUserAvatarState = {
  label: string;
  title: string;
};

const guestAvatar: CurrentUserAvatarState = {
  label: "P",
  title: "Guest",
};

function createAvatarState(name: string | null | undefined) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return guestAvatar;
  }

  return {
    label: trimmedName.charAt(0).toUpperCase(),
    title: trimmedName,
  };
}

export function CurrentUserAvatar() {
  const authClient = useMemo(() => createAuthClient(), []);
  const [avatar, setAvatar] = useState<CurrentUserAvatarState>(guestAvatar);

  useEffect(() => {
    let cancelled = false;

    authClient
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setAvatar(createAvatarState(user?.name));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvatar(guestAvatar);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authClient]);

  return (
    <div className="avatar" title={avatar.title}>
      {avatar.label}
    </div>
  );
}
