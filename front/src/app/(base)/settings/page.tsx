"use client";

import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { z } from "zod";

import api from "@/app/api";
import Loading from "@/app/loading";
import type { AppTokenPublic, AuthConfig } from "@/api/auth";
import { useAuth } from "@/components/auth/AuthContext";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { DialogOverlay } from "@/components/Dialog";
import { H3 } from "@/components/Headings";
import Hero from "@/components/Hero";
import Tooltip from "@/components/Tooltip";
import { AddIcon, DeleteIcon, RevokeIcon } from "@/components/icons";
import { AppTokenPermissionsSchema } from "@/schemas";

type AppTokenPermissions = z.infer<typeof AppTokenPermissionsSchema>;

function formatDateTime(d: Date | undefined | null): string {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function permissionsLabel(p: AppTokenPermissions): string {
  if (p === "read_write") return "Read & write";
  if (p === "read") return "Read only";
  return "Write only";
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [tokens, setTokens] = useState<AppTokenPublic[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [newPlaintextToken, setNewPlaintextToken] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createExpires, setCreateExpires] = useState("");
  const [createPermissions, setCreatePermissions] =
    useState<AppTokenPermissions>("read_write");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const refreshTokens = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.auth.listAppTokens();
      setTokens(list);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Failed to load tokens";
      setLoadError(msg);
      toast.error("Failed to load app tokens");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.auth.getAuthConfig();
        if (!cancelled) setAuthConfig(cfg);
      } catch {
        if (!cancelled) setAuthConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshTokens();
  }, [refreshTokens]);

  const openCreate = () => {
    setCreateTitle("");
    setCreateExpires("");
    setCreatePermissions("read_write");
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const title = createTitle.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    setCreateSubmitting(true);
    try {
      const expires_at =
        createExpires.trim() === "" ? undefined : new Date(createExpires).toISOString();
      const created = await api.auth.createAppToken({
        title,
        expires_at: expires_at ?? null,
        permissions: createPermissions,
      });
      setCreateOpen(false);
      setNewPlaintextToken(created.token);
      setSecretOpen(true);
      await refreshTokens();
    } catch (e: unknown) {
      const detail =
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to create token");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const closeSecretModal = () => {
    setSecretOpen(false);
    setNewPlaintextToken(null);
  };

  const revoke = async (row: AppTokenPublic) => {
    if (row.revoked_at) return;
    if (!window.confirm(`Revoke token “${row.title}”? It will stop working immediately.`)) {
      return;
    }
    try {
      await api.auth.revokeAppToken(row.id);
      toast.success("Token revoked");
      await refreshTokens();
    } catch {
      toast.error("Failed to revoke token");
    }
  };

  const purge = async (row: AppTokenPublic) => {
    if (!row.revoked_at) return;
    if (
      !window.confirm(
        `Permanently remove “${row.title}” from your list? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await api.auth.purgeAppToken(row.id);
      toast.success("Token removed");
      await refreshTokens();
    } catch (e: unknown) {
      const detail =
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to remove token");
    }
  };

  if (!user) {
    return <Loading />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <Hero text="Account settings" />

      <div className="flex max-w-4xl flex-col gap-6 p-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <H3 className="mb-0">Account</H3>
            {authConfig?.account_url ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  window.open(
                    authConfig.account_url!,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                Change password
              </Button>
            ) : null}
          </div>
          <dl className="grid grid-cols-1 gap-2 text-stone-700 dark:text-stone-300 sm:grid-cols-[8rem_1fr]">
            <dt className="text-stone-500 dark:text-stone-400">Name</dt>
            <dd>{user.name?.trim() || "—"}</dd>
            <dt className="text-stone-500 dark:text-stone-400">Email</dt>
            <dd>{user.email?.trim() || "—"}</dd>
            <dt className="text-stone-500 dark:text-stone-400">Username</dt>
            <dd>{user.username}</dd>
          </dl>
          {!authConfig?.account_url ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Identity provider account link is not configured.
            </p>
          ) : null}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <H3 className="mb-0">App tokens</H3>
            <Tooltip tooltip="Create token" placement="bottom">
              <Button type="button" variant="secondary" onClick={openCreate} title="Create token">
                <AddIcon className="h-5 w-5" />
              </Button>
            </Tooltip>
          </div>
          {loadError && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
          )}
          {tokens === null ? (
            <Loading />
          ) : tokens.length === 0 ? (
            <p className="text-stone-600 dark:text-stone-400">No tokens yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-stone-200 dark:border-stone-600">
              <table className="min-w-full divide-y divide-stone-200 text-sm dark:divide-stone-600">
                <thead className="bg-stone-100 dark:bg-stone-900/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-stone-700 dark:text-stone-300">
                      Title
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-stone-700 dark:text-stone-300">
                      Created
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-stone-700 dark:text-stone-300">
                      Expires
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-stone-700 dark:text-stone-300">
                      Revoked
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-stone-700 dark:text-stone-300">
                      Access
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-stone-700 dark:text-stone-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white dark:divide-stone-700 dark:bg-stone-800">
                  {tokens.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-stone-800 dark:text-stone-200">{row.title}</td>
                      <td className="px-3 py-2 text-stone-700 dark:text-stone-300 whitespace-nowrap">
                        {formatDateTime(row.created_on)}
                      </td>
                      <td className="px-3 py-2 text-stone-700 dark:text-stone-300 whitespace-nowrap">
                        {formatDateTime(row.expires_at ?? null)}
                      </td>
                      <td className="px-3 py-2 text-stone-700 dark:text-stone-300 whitespace-nowrap">
                        {formatDateTime(row.revoked_at ?? null)}
                      </td>
                      <td className="px-3 py-2 text-stone-700 dark:text-stone-300">
                        {permissionsLabel(row.permissions)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {!row.revoked_at ? (
                            <Tooltip tooltip="Revoke token" placement="bottom" portal={true}>
                              <Button
                                type="button"
                                variant="warning"
                                onClick={() => void revoke(row)}
                                title="Revoke token"
                              >
                                <RevokeIcon className="h-5 w-5" />
                              </Button>
                            </Tooltip>
                          ) : (
                            <Tooltip tooltip="Delete token" placement="bottom" portal={true}>
                              <Button
                                type="button"
                                variant="danger"
                                onClick={() => void purge(row)}
                                title="Delete token"
                              >
                                <DeleteIcon className="h-5 w-5" />
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <DialogOverlay
        variant="panel"
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create App token"
      >
        {() => (
          <div className="flex w-full flex-col gap-5">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Choose a label, optional expiry, and what this token may do over the API.
            </p>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-stone-800 dark:text-stone-200">Title</span>
              <input
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-stone-900 shadow-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="e.g. CI, laptop, script"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-stone-800 dark:text-stone-200">
                Expires (optional)
              </span>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-stone-900 shadow-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                value={createExpires}
                onChange={(e) => setCreateExpires(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-stone-800 dark:text-stone-200">Permissions</span>
              <select
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-stone-900 shadow-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                value={createPermissions}
                onChange={(e) =>
                  setCreatePermissions(e.target.value as AppTokenPermissions)
                }
              >
                <option value="read_write">Read & write</option>
                <option value="read">Read only</option>
                <option value="write">Write only</option>
              </select>
            </label>
            <div className="-mx-4 flex justify-end gap-2 border-t border-stone-100 px-4 pt-4 dark:border-stone-600">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={createSubmitting} onClick={() => void submitCreate()}>
                {createSubmitting ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        )}
      </DialogOverlay>

      <DialogOverlay
        variant="panel"
        panelClassName="max-w-lg w-full sm:max-w-2xl"
        isOpen={secretOpen}
        onClose={closeSecretModal}
        title="Save your token"
      >
        {() => (
          <div className="flex w-full flex-col gap-5">
            <p className="text-sm text-rose-700 dark:text-rose-300">
              Copy this token now. You will not be able to see it again.
            </p>
            <pre className="max-h-48 overflow-auto break-all rounded-md border border-stone-200 bg-stone-100 p-4 font-mono text-xs leading-relaxed text-stone-900 dark:border-stone-600 dark:bg-stone-900/80 dark:text-stone-100">
              {newPlaintextToken}
            </pre>
            <div className="-mx-4 flex justify-end gap-2 border-t border-stone-100 px-4 pt-4 dark:border-stone-600">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  newPlaintextToken && void copyText("Token", newPlaintextToken)
                }
              >
                Copy token
              </Button>
              <Button type="button" onClick={closeSecretModal}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogOverlay>
    </div>
  );
}
