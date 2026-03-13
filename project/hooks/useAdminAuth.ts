"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type AdminAuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "unauthorized" }       // signed in but not admin role
  | { status: "authorized"; user: User };

export function useAdminAuth(): {
  state: AdminAuthState;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
} {
  const [state, setState] = useState<AdminAuthState>({ status: "loading" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ status: "unauthenticated" });
        return;
      }

      // Verify admin role via backend
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`${BASE_URL}/admin/fleet/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setState({ status: "authorized", user: firebaseUser });
        } else {
          setState({ status: "unauthorized" });
        }
      } catch {
        setState({ status: "unauthorized" });
      }
    });
    return unsub;
  }, []);

  async function login(email: string, password: string): Promise<string | null> {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        return "Invalid email or password.";
      }
      return err?.message || "Login failed.";
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return { state, login, logout };
}
