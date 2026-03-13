"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { AuthModal } from "@/components/ui/AuthModal";
import { API_ENDPOINTS, UserProfile, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, UserCircle, LogOut, Check, AlertCircle, Camera, Phone, ShieldCheck, Mail, PencilLine, Wallet, Navigation,
} from "lucide-react";
import { notify } from "@/lib/notify";

function isValidNIC(nic: string) {
  return /^[0-9]{9}[VXvx]$/.test(nic) || /^[0-9]{12}$/.test(nic);
}

function isValidPhone(phone: string) {
  return /^(?:\+94|94|0)?[0-9]{9,10}$/.test(phone.replace(/[\s\-]/g, ""));
}

async function compressImage(file: File, maxPx = 200, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function UserPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAuth, setShowAuth] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState("");
  const [nicInput, setNicInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  async function loadProfile() {
    if (!user) return;
    setProfileLoading(true);
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (data?.success) {
      const p: UserProfile = data.data;
      setProfile(p);
      setNameInput(p.displayName || user.displayName || "");
      setNicInput(p.nic || "");
      setPhoneInput(p.phone || "");
      setPhotoPreview(p.photoURL || null);
    } else {
      notify.error("Failed to load profile details.");
    }
    setProfileLoading(false);
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      setPhotoPreview(compressed);
      const token = await user.getIdToken();
      const { data, error } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photoURL: compressed }),
      });
      if (data?.success) {
        setProfile(data.data);
        notify.success("Profile photo updated.");
      } else if (error) {
        notify.error("Failed to upload photo.", { description: error });
      }
    } catch (err) {
      notify.error("Image upload failed.", { description: String(err) });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSaveProfile() {
    if (!user) return;

    const errors: Record<string, string> = {};
    const name = nameInput.trim();
    const nic = nicInput.trim().toUpperCase();
    const phone = phoneInput.trim();

    if (!name) errors.name = "Name is required.";
    if (nic && !isValidNIC(nic)) errors.nic = "Use 9 digits + V/X (old) or 12 digits (new format).";
    if (phone && !isValidPhone(phone)) errors.phone = "Enter a valid Sri Lankan number (e.g. 0712345678).";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      notify.warning("Please fix profile form errors before saving.");
      return;
    }

    setFormErrors({});
    setSavingProfile(true);

    const token = await user.getIdToken();
    if (name !== user.displayName) {
      try {
        await updateProfile(user, { displayName: name });
      } catch {
        // Keep backend save regardless
      }
    }

    const { data, error } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: name, nic, phone }),
    });

    if (data?.success) {
      const updatedProfile: UserProfile = data.data;
      setProfile(updatedProfile);
      setNameInput(updatedProfile.displayName || name);
      setNicInput(updatedProfile.nic || nic);
      setPhoneInput(updatedProfile.phone || phone);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
      setIsEditOpen(false);
      notify.success("Profile updated successfully.");
    } else {
      notify.error(error || "Failed to update profile.");
    }

    setSavingProfile(false);
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/");
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary opacity-30" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 md:p-10 max-w-xl mx-auto w-full flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
          <UserCircle className="text-slate-300" size={48} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">My Account</h1>
          <p className="text-slate-500">Sign in to manage your profile details.</p>
        </div>
        <Button className="h-12 px-8 rounded-xl font-bold" onClick={() => setShowAuth(true)}>
          Sign In / Create Account
        </Button>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      </div>
    );
  }

  const initials = (user.displayName || user.email || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const isProfileComplete = !!(profile?.nic && profile?.phone);
  const displayName = profile?.displayName || user.displayName || "No Name Set";
  const linkedEmail = profile?.linkedEmail || profile?.email || user.email || "N/A";

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="relative shrink-0">
          <div
            className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center overflow-hidden cursor-pointer ring-2 ring-transparent hover:ring-primary/40 transition-all"
            onClick={() => fileInputRef.current?.click()}
            title="Change photo"
          >
            {photoUploading ? (
              <Loader2 size={22} className="animate-spin text-white" />
            ) : photoPreview ? (
              <img src={photoPreview} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-black">{initials}</span>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm hover:bg-slate-50"
          >
            <Camera size={11} className="text-slate-500" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-slate-900">{displayName}</h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">{linkedEmail}</p>
          {!isProfileComplete && (
            <div className="flex items-center gap-2 mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <AlertCircle size={13} className="text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 font-bold">Complete NIC and phone before payment</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
          <Button
            variant="outline"
            className="rounded-xl font-bold"
            onClick={() => router.push("/wallet")}
          >
            <Wallet size={14} className="mr-2" /> Open Wallet
          </Button>
          <Button
            variant="outline"
            className="rounded-xl font-bold"
            onClick={() => router.push("/journeys")}
          >
            <Navigation size={14} className="mr-2" /> My Journeys
          </Button>
          <Button
            variant="outline"
            className="rounded-xl font-bold"
            onClick={() => setIsEditOpen(true)}
          >
            <PencilLine size={14} className="mr-2" /> Edit Profile
          </Button>
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="rounded-xl border-red-100 text-red-500 hover:bg-red-50"
          >
            <LogOut size={14} className="mr-2" /> Sign Out
          </Button>
        </div>
      </div>

      {profileLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary opacity-30" size={32} />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Profile Details</p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Full Name</p>
              <p className="text-sm font-bold text-slate-800">{displayName}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                <Mail size={12} className="text-primary" /> Email
              </p>
              <p className="text-sm font-bold text-slate-800 break-all">{linkedEmail}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-primary" /> NIC
              </p>
              <p className="text-sm font-bold text-slate-800">{profile?.nic || "Not added"}</p>
              {!profile?.nic && (
                <Badge variant="outline" className="mt-2 border-amber-200 text-amber-700 bg-amber-50 text-[9px] font-black">REQUIRED</Badge>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                <Phone size={12} className="text-primary" /> Phone
              </p>
              <p className="text-sm font-bold text-slate-800">{profile?.phone || "Not added"}</p>
              {!profile?.phone && (
                <Badge variant="outline" className="mt-2 border-amber-200 text-amber-700 bg-amber-50 text-[9px] font-black">REQUIRED</Badge>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Update Profile Details</DialogTitle>
            <DialogDescription>
              Update your name, NIC, and phone number.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Full Name</Label>
              <Input
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setFormErrors((prev) => ({ ...prev, name: "" }));
                }}
                placeholder="Your full name"
                className="h-11 rounded-xl"
              />
              {formErrors.name && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.name}</p>}
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">NIC</Label>
              <Input
                value={nicInput}
                onChange={(e) => {
                  setNicInput(e.target.value);
                  setFormErrors((prev) => ({ ...prev, nic: "" }));
                }}
                placeholder="e.g. 851234567V or 198512345678"
                className="h-11 rounded-xl font-mono"
              />
              {formErrors.nic ? (
                <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.nic}</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1">Old format: 9 digits + V/X | New format: 12 digits</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Phone Number</Label>
              <Input
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  setFormErrors((prev) => ({ ...prev, phone: "" }));
                }}
                placeholder="e.g. 0712345678 or +94712345678"
                className="h-11 rounded-xl"
              />
              {formErrors.phone && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.phone}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl font-bold" onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 size={16} className="animate-spin mr-2" /> : profileSaved ? <Check size={16} className="mr-2 text-emerald-300" /> : null}
              {profileSaved ? "Saved!" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
