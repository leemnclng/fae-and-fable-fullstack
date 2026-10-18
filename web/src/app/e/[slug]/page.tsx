"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GuestView, type GuestQuota } from "@/components/guest-view";
import {
  API,
  api,
  ApiError,
  fileUrl,
  type GuestDesign,
  type WallPhoto,
} from "@/lib/api";
import { resizeImage } from "@/lib/resize";
import { useStoredValue } from "@/lib/storage";

const WALL_REFRESH_MS = 15_000;
const FRESH_MS = 5 * 60_000; // photos newer than this get a "New" badge

type GuestEvent = { name: string; eventDate: string; design: GuestDesign };

/** POST one photo with XHR, since fetch can't report upload progress. */
function sendPhoto(
  url: string,
  token: string,
  file: File,
  messageId: number | null,
  onBytes: (loaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("photos", file);
    if (messageId) body.set("messageId", String(messageId));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      if (xhr.status < 300) return resolve();
      let message =
        xhr.status === 410
          ? "This link has expired."
          : "Upload failed, please try again.";
      try {
        message =
          [JSON.parse(xhr.responseText).message].flat().join(", ") || message;
      } catch {}
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () =>
      reject(
        new ApiError(0, "Connection lost. Check your signal and try again."),
      );
    xhr.send(body);
  });
}

export default function GuestUploadPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<GuestEvent | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useStoredValue(`ff_guest_${slug}`, "session");
  const [wall, setWall] = useState<WallPhoto[] | null>(null);
  const [guest, setGuest] = useState<GuestQuota | null>(null);

  // Who's signed in and how many photos they have left; an old or expired session sends them back to the name step
  const loadMe = useCallback(async () => {
    if (!token) return;
    try {
      setGuest(await api<GuestQuota>(`/guest/${slug}/me`, { token }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToken(null);
    }
  }, [slug, token, setToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadMe only sets state after its await
    loadMe();
  }, [loadMe]);

  const loadWall = useCallback(async () => {
    if (!token) return;
    const res = await api<{ enabled: boolean; photos: WallPhoto[] }>(
      `/guest/${slug}/wall`,
      { token },
    ).catch(() => null);
    if (!res) return;
    // Photo files are fetched by <img>, which can't send headers, so the token rides in the URL
    const now = Date.now();
    setWall(
      res.enabled
        ? res.photos.map((p) => ({
            ...p,
            url: `${API}${p.url}?t=${encodeURIComponent(token)}`,
            fresh: !!p.createdAt && now - Date.parse(p.createdAt) < FRESH_MS,
          }))
        : null,
    );
  }, [slug, token]);

  // Keep the wall live while the page is open
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadWall only sets state after its await
    loadWall();
    const timer = setInterval(
      () => document.visibilityState === "visible" && loadWall(),
      WALL_REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [loadWall]);

  useEffect(() => {
    api<GuestEvent>(`/guest/${slug}`)
      .then((e) =>
        setEvent({
          ...e,
          design: {
            ...e.design,
            background: e.design.background && fileUrl(e.design.background),
          },
        }),
      )
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error)
    return <p className="m-auto p-6 text-center text-stone-600">{error}</p>;
  // Wait for a saved session to be checked so returning guests land on the right step
  if (!event || (token && !guest))
    return <p className="m-auto p-6 text-stone-500">Loading…</p>;

  return (
    <GuestView
      event={event}
      design={event.design}
      initialStep={token ? "upload" : "passcode"}
      guest={guest}
      onSwitchGuest={() => {
        setGuest(null);
        setToken(null);
      }}
      onUnlock={async (passcode, name) => {
        const { token: newToken, ...quota } = await api<
          GuestQuota & { token: string }
        >(`/guest/${slug}/unlock`, {
          method: "POST",
          body: JSON.stringify({ passcode, name }),
        });
        setGuest(quota);
        setToken(newToken);
      }}
      wall={wall}
      onUpload={async (files, note, onProgress) => {
        const failed: { file: File; reason: string }[] = [];
        try {
          // The private note goes first so the photos can be linked to it in the client's guestbook
          const messageId = note.message
            ? (
                await api<{ id: number }>(`/guest/${slug}/messages`, {
                  method: "POST",
                  token,
                  body: JSON.stringify(note),
                })
              ).id
            : null;
          // One resized photo per request: each stays under the host's request limit, and one failure doesn't sink the rest
          for (const [i, file] of files.entries()) {
            try {
              const small = await resizeImage(file);
              await sendPhoto(
                `${API}/guest/${slug}/photos`,
                token ?? "",
                small,
                messageId,
                (loaded) => onProgress((i + Math.min(1, loaded / small.size)) / files.length),
              );
            } catch (e) {
              // An expired link or session means nothing else will go through either
              if (e instanceof ApiError && (e.status === 401 || e.status === 410)) throw e;
              failed.push({ file, reason: (e as Error).message });
            }
            onProgress((i + 1) / files.length);
          }
          loadWall();
          await loadMe();
          return { failed };
        } catch (e) {
          // Session expired or passcode changed: send them back to the passcode step on next visit
          if (e instanceof ApiError && e.status === 401) setToken(null);
          throw e;
        }
      }}
    />
  );
}
