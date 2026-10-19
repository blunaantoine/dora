import { redirect } from "next/navigation";

// Chemin du cahier des charges (§23 : « /proposer-une-personne ») — redirection
// vers la route implémentée /proposer pour conserver la correspondance.
export default function ProposerUnePersonnePage() {
  redirect("/proposer");
}
