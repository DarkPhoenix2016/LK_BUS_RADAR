"use client"

import { Phone, ArrowLeft, Bus } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export default function ContactsPage() {
    const contacts = [
        { name: "Galle Bus Stand", phone: "091-2234567", category: "Southern" },
        { name: "Matara Bus Stand", phone: "041-2234567", category: "Southern" },
        { name: "Hambantota Bus Stand", phone: "047-2234567", category: "Southern" },
        { name: "Tangalle Bus Stand", phone: "047-2244567", category: "Southern" },
        { name: "Ambalangoda Bus Stand", phone: "091-2254567", category: "Southern" },
        { name: "Elpitiya Bus Stand", phone: "091-2294567", category: "Southern" },
    ]

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border/50 p-4">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <Link href="/" className="h-10 w-10 rounded-xl hover:bg-muted flex items-center justify-center transition-all">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="font-extrabold text-xl tracking-tight">Bus Stand Contacts</h1>
                            <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Help center</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-4xl mx-auto w-full p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contacts.map((contact, index) => (
                        <a
                            key={contact.name}
                            href={`tel:${contact.phone}`}
                            className="flex items-center justify-between p-6 rounded-3xl bg-card hover:bg-muted/50 transition-all border border-border/50 hover:shadow-xl group"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                    <Phone className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground text-lg">{contact.name}</h3>
                                    <p className="text-xs text-muted-foreground font-medium">{contact.category} Region</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-black text-primary tabular-nums tracking-tight">{contact.phone}</p>
                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Available 24/7</span>
                            </div>
                        </a>
                    ))}
                </div>

                {/* Info Card */}
                <div className="mt-12 p-8 rounded-[40px] bg-gradient-to-br from-primary/5 to-primary/20 border border-primary/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mr-10 -mt-10 opacity-10">
                        <Bus className="h-40 w-40" />
                    </div>
                    <div className="relative z-10">
                        <h2 className="text-2xl font-black text-foreground mb-2">Emergency Hub</h2>
                        <p className="text-muted-foreground font-medium max-w-lg mb-6 leading-relaxed">
                            If you have lost any belongings or need urgent assistance regarding bus schedules, please contact the respective bus stand officials immediately.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full border border-white/50 text-sm font-bold shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Main Terminal Active
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="p-8 text-center text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest border-t border-border/10">
                © 2026 Southern Province Road Passenger Transport Authority
            </footer>
        </div>
    )
}
