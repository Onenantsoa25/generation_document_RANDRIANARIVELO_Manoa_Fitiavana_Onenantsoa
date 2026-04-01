import axios from 'axios';
import os from 'os';
import fs from 'fs';
import path from 'path';

interface PointMesure {
  temps: number;
  traites: number;
  cpu: number;
  memoire: number;
  debit: number;
}

class TestPerformance {
  private urlApi: string;
  private points: PointMesure[] = [];
  private dossierSortie: string;

  constructor(urlApi: string = 'http://api:3000') {
    this.urlApi = urlApi;
    this.dossierSortie = path.join(process.cwd(), 'src','rapports-benchmark');
  }

  private getCPU(): number {
    const processeurs = os.cpus();
    let totalInactif = 0;
    let totalActif = 0;
    
    for (const cpu of processeurs) {
      for (const type in cpu.times) {
        totalActif += cpu.times[type as keyof typeof cpu.times];
      }
      totalInactif += cpu.times.idle;
    }
    
    const inactif = totalInactif / processeurs.length;
    const actif = totalActif / processeurs.length;
    return (1 - inactif / actif) * 100;
  }

  private getMemoire(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  private attendre(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private afficherProgression(actuel: number, total: number, debit: number, cpu: number, memoire: number): void {
    const pourcentage = (actuel / total * 100).toFixed(1);
    const largeurBarre = 30;
    const rempli = Math.floor((actuel / total) * largeurBarre);
    const barre = '='.repeat(rempli) + '-'.repeat(largeurBarre - rempli);
    
    const texte = '[' + barre + '] ' + pourcentage + '% | ' + actuel + '/' + total + ' docs | ' +
      debit.toFixed(1) + ' docs/s | CPU: ' + cpu.toFixed(1) + '% | Memoire: ' + memoire + 'Mo';
    
    process.stdout.write('\r\x1b[K');
    process.stdout.write(texte);
  }

  private creerGraphiqueTexte(valeurs: number[], titre: string, unite: string): string {
    if (valeurs.length === 0) {
      return 'Aucune donnee disponible';
    }
    
    const max = Math.max(...valeurs);
    const min = Math.min(...valeurs);
    const hauteur = 15;
    const largeur = 60;
    
    let resultat = '\n';
    resultat += titre + ' (' + unite + ')\n';
    resultat += '\n';
    
    for (let ligne = hauteur; ligne >= 0; ligne--) {
      const valeurLigne = min + (ligne / hauteur) * (max - min);
      let ligneTexte = '';
      
      if (ligne === hauteur) {
        ligneTexte += max.toFixed(0).padStart(6) + ' ';
      } else if (ligne === 0) {
        ligneTexte += min.toFixed(0).padStart(6) + ' ';
      } else {
        ligneTexte += '      ';
      }
      
      ligneTexte += '|';
      
      for (let i = 0; i < valeurs.length && i < largeur; i++) {
        const normalise = (valeurs[i] - min) / (max - min);
        const hauteurPoint = Math.floor(normalise * hauteur);
        
        if (hauteurPoint >= ligne) {
          ligneTexte += '*';
        } else {
          ligneTexte += ' ';
        }
      }
      
      resultat += ligneTexte + '\n';
    }
    
    resultat += '      +';
    for (let i = 0; i < Math.min(valeurs.length, largeur); i++) {
      resultat += '-';
    }
    resultat += '\n';
    
    resultat += '      0';
    for (let i = 1; i <= 5; i++) {
      const position = Math.floor((i / 5) * Math.min(valeurs.length, largeur));
      const espaces = Math.max(0, position - (resultat.length - 7));
      resultat += ' '.repeat(espaces) + Math.floor(i * valeurs.length / 5);
    }
    resultat += '\n';
    
    return resultat;
  }

  async lancerTest(nombreDocuments: number = 1000): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('TEST DE PERFORMANCE - ' + nombreDocuments + ' DOCUMENTS');
    console.log('='.repeat(80) + '\n');
    
    console.log('Les resultats seront sauvegardes dans: ' + this.dossierSortie);
    console.log('');

    const debut = Date.now();
    const utilisateurs = [];
    for (let i = 1; i <= nombreDocuments; i++) {
      utilisateurs.push('user_' + i);
    }

    console.log('Envoi de la demande...');
    const debutEnvoi = Date.now();
    
    const reponse = await axios.post(this.urlApi + '/api/documents/batch', {
      userIds: utilisateurs,
      templateName: 'cerfa'
    });
    
    const idLot = reponse.data.batchId;
    console.log('Numero du lot: ' + idLot);
    console.log('Temps d envoi: ' + (Date.now() - debutEnvoi) + 'ms\n');

    await this.attendre(2000);

    console.log('Traitement en cours...\n');
    
    let dernierTraite = 0;
    let termine = false;
    
    const intervalleProgression = setInterval(() => {
      if (!termine && this.points.length > 0) {
        const dernier = this.points[this.points.length - 1];
        this.afficherProgression(dernier.traites, nombreDocuments, dernier.debit, dernier.cpu, dernier.memoire);
      }
    }, 100);

    while (!termine && (Date.now() - debut) < 300000) {
      try {
        const etat = await axios.get(this.urlApi + '/api/documents/batch/' + idLot);
        const traites = etat.data.processedDocuments;
        const echoues = etat.data.failedDocuments;
        
        if (traites !== dernierTraite) {
          const ecoule = (Date.now() - debut) / 1000;
          const debit = traites / ecoule;
          const cpu = this.getCPU();
          const memoire = this.getMemoire();
          
          this.points.push({
            temps: ecoule,
            traites: traites + echoues,
            cpu: cpu,
            memoire: memoire,
            debit: debit
          });
          
          dernierTraite = traites;
        }
        
        if (etat.data.status === 'completed') {
          termine = true;
          break;
        }
        
        await this.attendre(500);
      } catch (erreur) {
        console.error('\nErreur lors de la recuperation du statut');
        await this.attendre(2000);
      }
    }
    
    clearInterval(intervalleProgression);
    console.log('\n');
    
    const tempsTotal = (Date.now() - debut) / 1000;
    const etatFinal = await axios.get(this.urlApi + '/api/documents/batch/' + idLot);
    const totalTraites = etatFinal.data.processedDocuments;
    const debitMoyen = totalTraites / tempsTotal;

    console.log('='.repeat(80));
    console.log('RESULTATS FINAUX');
    console.log('='.repeat(80));
    console.log('');
    console.log('Documents traites: ' + totalTraites + '/' + nombreDocuments);
    console.log('Temps total: ' + tempsTotal.toFixed(2) + ' secondes');
    console.log('Debit moyen: ' + debitMoyen.toFixed(2) + ' documents par seconde');
    console.log('Temps par document: ' + (tempsTotal / totalTraites * 1000).toFixed(2) + ' ms');
    console.log('');

    const valeursCPU = this.points.map(p => p.cpu);
    const valeursMemoire = this.points.map(p => p.memoire);
    const valeursDebit = this.points.map(p => p.debit);
    
    this.afficherResume(valeursCPU, valeursMemoire, valeursDebit);
    this.afficherTableau();

    await this.genererRapport(nombreDocuments, tempsTotal, debitMoyen, valeursCPU, valeursMemoire, valeursDebit);
  }

  private afficherResume(cpu: number[], memoire: number[], debit: number[]): void {
    const sommeCPU = cpu.reduce((a, b) => a + b, 0);
    const cpuMoy = (sommeCPU / cpu.length).toFixed(1);
    const cpuMax = Math.max(...cpu).toFixed(1);
    const cpuMin = Math.min(...cpu).toFixed(1);
    
    const sommeMemoire = memoire.reduce((a, b) => a + b, 0);
    const memMoy = (sommeMemoire / memoire.length).toFixed(1);
    const memMax = Math.max(...memoire);
    const memMin = Math.min(...memoire);
    
    const sommeDebit = debit.reduce((a, b) => a + b, 0);
    const debitMoy = (sommeDebit / debit.length).toFixed(1);
    const debitMax = Math.max(...debit).toFixed(1);
    const debitMin = Math.min(...debit).toFixed(1);
    
    console.log('RESUME STATISTIQUE');
    console.log('-'.repeat(55));
    console.log('Mesure           | Moyenne | Maximum | Minimum');
    console.log('-'.repeat(55));
    console.log('CPU (%)          | ' + cpuMoy.padStart(7) + ' | ' + cpuMax.padStart(7) + ' | ' + cpuMin.padStart(7));
    console.log('Memoire (Mo)     | ' + memMoy.padStart(7) + ' | ' + memMax.toString().padStart(7) + ' | ' + memMin.toString().padStart(7));
    console.log('Debit (doc/s)    | ' + debitMoy.padStart(7) + ' | ' + debitMax.padStart(7) + ' | ' + debitMin.padStart(7));
    console.log('-'.repeat(55) + '\n');
  }

  private afficherTableau(): void {
    console.log('EVOLUTION DANS LE TEMPS');
    console.log('-'.repeat(70));
    console.log('Temps(s) | Documents | Debit | CPU(%) | Memoire(Mo)');
    console.log('-'.repeat(70));
    
    const pas = Math.max(1, Math.floor(this.points.length / 15));
    for (let i = 0; i < this.points.length; i += pas) {
      const p = this.points[i];
      const temps = p.temps.toFixed(1);
      const traites = p.traites.toString();
      const debit = p.debit.toFixed(1);
      const cpu = p.cpu.toFixed(1);
      const memoire = p.memoire.toString();
      
      console.log(
        temps.padStart(7) + ' | ' +
        traites.padStart(9) + ' | ' +
        debit.padStart(6) + ' | ' +
        cpu.padStart(6) + ' | ' +
        memoire.padStart(9) + 'Mo'
      );
    }
    console.log('-'.repeat(70) + '\n');
  }

  private async genererRapport(
    totalDocs: number, 
    tempsTotal: number, 
    debitMoyen: number,
    cpu: number[],
    memoire: number[],
    debit: number[]
  ): Promise<void> {
    if (!fs.existsSync(this.dossierSortie)) {
      fs.mkdirSync(this.dossierSortie, { recursive: true });
      console.log('Dossier cree: ' + this.dossierSortie);
    }

    const sommeCPU = cpu.reduce((a, b) => a + b, 0);
    const cpuMoy = (sommeCPU / cpu.length).toFixed(1);
    const cpuMax = Math.max(...cpu).toFixed(1);
    const cpuMin = Math.min(...cpu).toFixed(1);
    
    const sommeMemoire = memoire.reduce((a, b) => a + b, 0);
    const memMoy = (sommeMemoire / memoire.length).toFixed(1);
    const memMax = Math.max(...memoire);
    const memMin = Math.min(...memoire);
    
    const sommeDebit = debit.reduce((a, b) => a + b, 0);
    const debitMoyCalcul = (sommeDebit / debit.length).toFixed(1);
    const debitMax = Math.max(...debit).toFixed(1);
    const debitMin = Math.min(...debit).toFixed(1);

    const graphiqueCPU = this.creerGraphiqueTexte(cpu, 'Utilisation du processeur', 'pourcentage');
    const graphiqueMemoire = this.creerGraphiqueTexte(memoire, 'Utilisation de la memoire', 'Mo');
    const graphiqueDebit = this.creerGraphiqueTexte(debit, 'Debit de traitement', 'documents par seconde');

    const maintenant = new Date();
    const timestamp = maintenant.getFullYear() + '-' + 
                     (maintenant.getMonth() + 1).toString().padStart(2, '0') + '-' +
                     maintenant.getDate().toString().padStart(2, '0') + '_' +
                     maintenant.getHours().toString().padStart(2, '0') + '-' +
                     maintenant.getMinutes().toString().padStart(2, '0') + '-' +
                     maintenant.getSeconds().toString().padStart(2, '0');
    
    let texteRapport = '';
    
    texteRapport += '# Rapport de test de performance\n\n';
    texteRapport += '## Informations generales\n';
    texteRapport += '- **Date**: ' + maintenant.toLocaleString() + '\n';
    texteRapport += '- **Documents traites**: ' + totalDocs + '\n';
    texteRapport += '- **Temps total**: ' + tempsTotal.toFixed(2) + ' secondes\n';
    texteRapport += '- **Debit moyen**: ' + debitMoyen.toFixed(2) + ' documents par seconde\n';
    texteRapport += '- **Temps par document**: ' + (tempsTotal / totalDocs * 1000).toFixed(2) + ' ms\n\n';
    
    texteRapport += '## Courbes de performance\n\n';
    texteRapport += '```\n';
    texteRapport += graphiqueCPU;
    texteRapport += '```\n\n';
    texteRapport += '```\n';
    texteRapport += graphiqueMemoire;
    texteRapport += '```\n\n';
    texteRapport += '```\n';
    texteRapport += graphiqueDebit;
    texteRapport += '```\n\n';
    
    texteRapport += '## Resume des mesures\n\n';
    texteRapport += '### Utilisation du processeur\n';
    texteRapport += '- Moyenne: ' + cpuMoy + '%\n';
    texteRapport += '- Maximum: ' + cpuMax + '%\n';
    texteRapport += '- Minimum: ' + cpuMin + '%\n\n';
    
    texteRapport += '### Utilisation de la memoire\n';
    texteRapport += '- Moyenne: ' + memMoy + ' Mo\n';
    texteRapport += '- Maximum: ' + memMax + ' Mo\n';
    texteRapport += '- Minimum: ' + memMin + ' Mo\n\n';
    
    texteRapport += '### Debit de traitement\n';
    texteRapport += '- Moyenne: ' + debitMoyCalcul + ' documents par seconde\n';
    texteRapport += '- Maximum: ' + debitMax + ' documents par seconde\n';
    texteRapport += '- Minimum: ' + debitMin + ' documents par seconde\n\n';
    
    texteRapport += '## Evolution dans le temps\n\n';
    texteRapport += '| Temps (s) | Documents | Debit (doc/s) | CPU (%) | Memoire (Mo) |\n';
    texteRapport += '|-----------|-----------|----------------|---------|--------------|\n';
    
    for (let i = 0; i < this.points.length; i += 5) {
      const p = this.points[i];
      texteRapport += '| ' + p.temps.toFixed(1) + ' | ' + p.traites + ' | ' + p.debit.toFixed(1) + ' | ' + p.cpu.toFixed(1) + ' | ' + p.memoire + ' |\n';
    }
    
    texteRapport += '\n## Conclusion\n\n';
    texteRapport += 'Le test montre que l application peut traiter **' + debitMoyen.toFixed(2) + ' documents par seconde**\n';
    texteRapport += 'avec une utilisation du processeur moyenne de **' + cpuMoy + '%**\n';
    texteRapport += 'et une memoire moyenne de **' + memMoy + ' Mo**.\n\n';
    
    texteRapport += '### Points importants:\n';
    
    let niveauDebit = '';
    if (debitMoyen < 20) {
      niveauDebit = 'Faible';
    } else if (debitMoyen < 40) {
      niveauDebit = 'Moyen';
    } else {
      niveauDebit = 'Eleve';
    }
    texteRapport += '- Debit: ' + niveauDebit + ' (' + debitMoyen.toFixed(2) + ' documents par seconde)\n';
    
    let niveauCPU = '';
    if (parseFloat(cpuMax) > 80) {
      niveauCPU = 'Saturation detectee';
    } else {
      niveauCPU = 'Normal';
    }
    texteRapport += '- Processeur: ' + niveauCPU + ' (maximum ' + cpuMax + '%)\n';
    
    let niveauMemoire = '';
    if (memMax > 500) {
      niveauMemoire = 'Utilisation elevee';
    } else {
      niveauMemoire = 'Normal';
    }
    texteRapport += '- Memoire: ' + niveauMemoire + ' (maximum ' + memMax + ' Mo)\n';

    const cheminRapport = path.join(this.dossierSortie, 'rapport_' + timestamp + '.md');
    fs.writeFileSync(cheminRapport, texteRapport);
    
    const cheminDonnees = path.join(this.dossierSortie, 'donnees_' + timestamp + '.json');
    const donneesJSON = {
      informations: {
        totalDocuments: totalDocs,
        tempsTotal: tempsTotal,
        debitMoyen: debitMoyen,
        date: maintenant
      },
      pointsMesure: this.points
    };
    fs.writeFileSync(cheminDonnees, JSON.stringify(donneesJSON, null, 2));
    
    console.log('');
    console.log('='.repeat(80));
    console.log('FICHIERS CREES AVEC SUCCES');
    console.log('='.repeat(80));
    console.log('');
    console.log('Rapport: ' + cheminRapport);
    console.log('Donnees: ' + cheminDonnees);
    console.log('');
    console.log('Dossier complet: ' + this.dossierSortie);
    console.log('');
  }
}

const test = new TestPerformance(process.env.API_URL || 'http://api:3000');
const nombre = parseInt(process.argv[2]) || 1000;
test.lancerTest(nombre).catch(console.error);