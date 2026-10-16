# Sikker levering fra Lovable til den eksisterende GitHub Pages-app

Målet er https://cliffdkp1990.github.io/dronehub-preview/. Ingen ny offentlig adresse oprettes. drone-finder-pro forbliver privat. Den fungerende QA9-app ændres ikke af denne infrastruktur-PR.

## Undersøgt grundlag

- Offentlig QA9: dronehub-preview, main 0f20507e824c3a454c5086c1de5fad5a9f6688b8. Selvstændig index.html uden buildværktøj; det eksisterende Pages-run bruger main/Jekyll.
- Privat Lovable-kilde er læst gennem den eksisterende Lovable-forbindelse og ejerens GitHub-visning. Den bruger React, TypeScript, Vite, TanStack Start og Bun. Dens normale build indeholder en server og kan ikke kopieres direkte til Pages.
- Den private kandidat tilføjer et separat statisk build med basestien /dronehub-preview/, prerenderede sider og sikker genåbning af direkte links. Lovables normale build bevares. Detaljeret audit og kildeændringer hører kun hjemme i det private repository.
- QA9-referenceforløbene bestod lokalt i Chromium og WebKit ved 320, 375, 390, 430 og 1280 px. Dette er emulering; fysisk iPhone er stadig et releasekrav.

## To PR'er før aktivering

1. Denne offentlige infrastruktur-PR tilføjer browserkontrol, sikkerhedstests, outputkontrol, publisher og en inaktiv workflow-skabelon. index.html, chrome-test.html og Pages-indstillingerne bevares.
2. En separat privat PR tilføjer build:pages, input-/URL-grænsetests og .github/workflows/pages-candidate.yml. Kildekode må ikke kopieres til den offentlige PR.

Det private workflow installerer fra bun.lock, kører enhedstests og TypeScript, bygger statiske filer, scanner output og tester Chromium/WebKit. Kun pages-dist må blive en offentlig kandidat; serverkode, kildefiler, .env, lockfiler og source maps afvises. CI-beviser opbevares kortvarigt i det private repository.

Publisheren kører i et nyt job efter grøn CI. To eksplicitte repository-variabler skal være true: PAGES_CANDIDATES_ENABLED og PAGES_QA9_PARITY_APPROVED. Begge skal være false eller mangle, indtil kravene nedenfor er opfyldt. Der er ikke oprettet token eller aktiveret variabler i dette arbejde.

Brug derefter et separat, begrænset token/App med Contents og Pull requests write alene til dronehub-preview. Ingen adgang til private repositories, administration eller workflow-write. Hemmeligheden PAGES_PUBLISH_TOKEN opbevares kun privat og gives alene til publisher-trinnet. Offentlig PR-CI har contents:read og ingen secrets. Brug aldrig pull_request_target til at køre kandidatkode med hemmeligheder.

Publisheren uploader kun kontrollerede statiske webfiler til en ny automation/lovable-branch og åbner en draft-PR. Den opdaterer ikke main, merger ikke og ændrer ingen Pages- eller synlighedsindstillinger. Den bevarer eksisterende filer, bortset fra godkendte appstier og tidligere manifestregistrerede buildfiler. CNAME og den eksisterende QA9-backup beskyttes. Et deployment-manifest med filhashes og kildecommit gør kandidaten sporbar.

## Krav før QA9 må erstattes

- Bevar godkendt design og funktioner. Kildeappen har flere katalogmodeller og Blueprint/Print Lab; de skal fortsat fungere.
- Under 250 g betyder positiv, endelig flyvevægt strengt mindre end 250. Test 249,99, 250, 251, ukendt og ugyldig vægt samt standard-/Plus-batteri. Kitvægt er ikke flyvevægt.
- Test samlet DKK-budget med drone, controller, tilbehør og fragt, præcis budgetgrænse og decimaler. Manglende pris eller fragt er ukendt. Gamle USD-tal må ikke blive sikre DKK-match.
- Genbrug QA9's fulde pakke-/budgetflow. Den private kilde har endnu ikke hele QA9's firefelts-regnehjælp; beståede kilde-tests beviser derfor ikke fuld QA9-paritet.
- Test søgning, filtre, skærmcontroller/RTH, sammenligning, tilføj/fjern, tomme resultater og direkte links/genindlæsning.
- Fysisk iPhone Safari og Chrome: startknapper, tastatur, safe areas og sammenligning. Kun sammenligningstabellen må kræve vandret scroll.
- Gennemgå første offentlige bundle for credentials og private data. En mønsterscanner kan ikke bevise fravær af alle hemmeligheder.
- Bekræft eksisterende Pages-kilde i Settings og indfør obligatorisk CI/PR-review uden auto-merge eller bypass. Bevar samme URL og repositoryets synlighed.

Når disse krav er dokumenteret og kandidaten har grøn offentlig CI, kan en almindelig, gennemgået merge lade den eksisterende Pages-mekanisme udgive buildet. Kontrollér derefter samme adresse og relevante direkte links. Selve aktiveringen og første release er senere trin; denne PR udgiver intet.

## Verifikation og rollback

Lokale resultater og resterende begrænsninger fremgår af den private audit og PR-beskrivelserne. GitHub Actions skal også bestå på de faktiske PR-commits; lokale tests er ikke GitHub-CI.

QA9-rollbackpunkt: 0f20507e824c3a454c5086c1de5fad5a9f6688b8. Revert kandidat-PR'en med et nyt commit og kør den normale Pages-proces på samme adresse. Omskriv aldrig publiceret historik; Lovable-synkronisering kræver almindelige nye commits/merges.
