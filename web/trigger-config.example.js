// Config do disparo do agente (Opção B — token no site).
//
// COMO USAR:
//   1. Copia este ficheiro para  web/trigger-config.js  (sem o .example).
//   2. Mete o teu GitHub fine-grained PAT (permissão Actions: Read and write,
//      só este repositório) no campo `token`.
//   3. `firebase deploy --only hosting`.
//
// IMPORTANTE:
//   • trigger-config.js está no .gitignore — NUNCA o commites. O GitHub revoga
//     tokens detetados em repositórios públicos.
//   • Este token fica PÚBLICO no site (é o modelo de segurança escolhido —
//     ver secção "Segurança do site" no README). Só permite disparar runs;
//     não dá acesso a código nem dados.

export const GITHUB_TRIGGER = {
  repo: "miguelguerra0318-creator/Pateo-das-Laranjeiras",
  token: "" // ← cola aqui o PAT no ficheiro real (trigger-config.js)
};
