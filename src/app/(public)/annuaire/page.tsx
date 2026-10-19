import { permanentRedirect } from "next/navigation";

// L'annuaire a déménagé vers /profils (§4.2) : redirection permanente (308)
// pour préserver les anciens liens et transférer le référencement.
export default function AncienAnnuaire() {
  permanentRedirect("/profils");
}
