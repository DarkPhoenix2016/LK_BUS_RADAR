"use client";

import { useRef, useState, useEffect } from "react";
import { signOut, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { AuthModal } from "@/components/ui/AuthModal";
import { API_ENDPOINTS, UserProfile, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { Loader2, UserCircle, Camera, Check, LogOut, Phone, ShieldCheck, Mail } from "lucide-react";

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

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAuth, setShowAuth] = useState(false);
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
    if (user) {
      loadProfile();
    }
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
    } else notify.error("Failed to load profile details.");
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
      const { data } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photoURL: compressed }),
      });
      if (data?.success) {
        setProfile(data.data);
        notify.success("Profile photo updated.");
      } else {
        notify.error("Failed to upload photo.");
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
        // keep backend save regardless
      }
    }

    const { data, error } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: name, nic, phone }),
    });

    if (data?.success) {
      setProfile(data.data);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
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
          <h1 className="text-2xl font-black text-slate-900 mb-2">Profile</h1>
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
          <h1 className="text-xl font-black text-slate-900">{user.displayName || "No Name Set"}</h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">{user.email}</p>
        </div>

        <Button variant="outline" onClick={handleSignOut} className="rounded-xl border-red-100 text-red-500 hover:bg-red-50 shrink-0">
          <LogOut size={16} className="mr-2" /> Sign Out
        </Button>
      </div>

      {profileLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary opacity-30" size={32} />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Personal Details</p>

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
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <ShieldCheck size={13} className="text-primary" /> National Identity Card (NIC)
              {profile?.nic && <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[9px] font-black ml-1">SAVED</Badge>}
            </Label>
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
              <p className="text-[10px] text-slate-400 mt-1">Old format: 9 digits + V or X | New format: 12 digits</p>
            )}
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Phone size={13} className="text-primary" /> Phone Number
              {profile?.phone && <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[9px] font-black ml-1">SAVED</Badge>}
            </Label>
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

          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Mail size={13} className="text-primary" /> Linked Email
            </Label>
            <Input
              value={profile?.linkedEmail || profile?.email || user.email || ""}
              disabled
              className="h-11 rounded-xl bg-slate-50 text-slate-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">Synced from your Firebase login email.</p>
          </div>

          <Button className="w-full h-12 rounded-xl font-bold" onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? <Loader2 size={16} className="animate-spin mr-2" /> : profileSaved ? <Check size={16} className="mr-2 text-emerald-300" /> : null}
            {profileSaved ? "Saved!" : "Save Profile"}
          </Button>
        </div>
      )}
    </div>
  );
}
