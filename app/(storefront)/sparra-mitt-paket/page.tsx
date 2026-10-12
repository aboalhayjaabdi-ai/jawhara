import type { Metadata } from "next";
import { TrackingLookupForm } from "@/components/tracking/tracking-lookup-form";

export const metadata: Metadata = { title: "Spåra din beställning" };

export default function TrackOrderPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-16 lg:px-0">
      <h1 className="mb-6 font-serif text-4xl">Spåra din beställning</h1>
      <p className="mb-8 text-sm leading-6 text-muted">
        Ange ditt ordernummer och den e-postadress du använde vid beställningen för att se status på
        din leverans.
      </p>
      <TrackingLookupForm />
    </div>
  );
}
