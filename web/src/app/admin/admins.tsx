"use client";

import { useState } from "react";
import { useAdmin, type AdminProps } from "./use-admin";

type AdminAccount = { id: number | "owner"; email: string; owner: boolean; createdAt: string | null };
type AdminList = { me: number | "owner"; admins: AdminAccount[] };

/** Admin accounts: any admin can add or remove others; the main account (from the API settings) always stays. */
export function Admins(props: AdminProps) {
  const { data, error, call, reload } = useAdmin<AdminList>("/admin/admins", props);
  const [added, setAdded] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function add(form: FormData) {
    setAdded("");
    try {
      const { email } = await call<{ email: string }>("/admin/admins", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      await reload();
      setAdded(`${email} can now log in. Share the password with them; they can change it here.`);
    } catch {
      // error is shown by useAdmin
    }
  }

  async function remove(admin: AdminAccount) {
    if (!confirm(`Remove ${admin.email}? They'll be logged out and can't log in again.`)) return;
    setAdded("");
    try {
      await call(`/admin/admins/${admin.id}`, { method: "DELETE" });
      await reload();
    } catch {
      // error is shown by useAdmin
    }
  }

  async function changePassword(form: FormData) {
    setPasswordSaved(false);
    try {
      await call("/admin/password", { method: "PUT", body: JSON.stringify(Object.fromEntries(form)) });
      setPasswordSaved(true);
    } catch {
      // error is shown by useAdmin
    }
  }

  if (!data) return <p className="text-stone-500">{error || "Loading…"}</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="card space-y-3">
        <h2 className="font-display text-xl">Admins</h2>
        <ul className="divide-y divide-stone-200">
          {data.admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {a.email}
                  {a.id === data.me && <span className="ml-2 text-xs text-stone-500">(you)</span>}
                </p>
                <p className="text-xs text-stone-500">
                  {a.owner ? "Main account · set in the API settings, can't be removed" : `Added ${new Date(a.createdAt!).toLocaleDateString()}`}
                </p>
              </div>
              {!a.owner && a.id !== data.me && (
                <button type="button" onClick={() => remove(a)} className="btn-ghost text-red-600">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <form action={add} className="card grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="font-display text-xl">Add an admin</h2>
          <p className="text-sm text-stone-500">They get full access to the admin page. Choose a starting password and share it with them.</p>
        </div>
        <label className="block text-sm text-stone-600">
          Email
          <input name="email" type="email" required autoComplete="off" className="input mt-1" />
        </label>
        <label className="block text-sm text-stone-600">
          Starting password
          <input name="password" type="text" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className="input mt-1" />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button className="btn">Add admin</button>
          {added && <span className="text-sm text-green-700">{added}</span>}
        </div>
      </form>

      {data.me !== "owner" && (
        <form action={changePassword} className="card grid gap-4 md:grid-cols-2">
          <h2 className="font-display text-xl md:col-span-2">Change your password</h2>
          <label className="block text-sm text-stone-600">
            Current password
            <input name="current" type="password" required autoComplete="current-password" className="input mt-1" />
          </label>
          <label className="block text-sm text-stone-600">
            New password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className="input mt-1" />
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <button className="btn">Change password</button>
            {passwordSaved && <span className="text-sm text-green-700">Password changed</span>}
          </div>
        </form>
      )}
    </div>
  );
}
