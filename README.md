# PDF Generator Service

Service de génération de documents (CERFA, conventions) capable de traiter des lots de 1000 documents en parallèle, avec résilience et monitoring.

## Table des matières

1. [Architecture](#architecture)
2. [Choix techniques](#choix-techniques)
3. [Déploiement](#déploiement)
---

## Architecture

### Vue d'ensemble
┌─────────────────────────────────────────────────────────────────┐
│                         1. Client                               │
│                    liste de 1000 utilisateurs                   │
│                    POST /api/documents/batch                    │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                          2. L'API                               │
│     - Reçoit la demande                                         │
│     - Crée un numéro de lot (batchId)                           │
│     - Note dans MongoDB les documents a faire                   │
│     - Met les 1000 tâches dans la file d'attente (Redis)        │
│     - Répond d'id du bacth                                      │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│           3. Redis (La File d'Attente)                          │
│     [Tâche1] [Tâche2] [Tâche3] ... [Tâche1000]                  │
│     chaque tache attend son tou                                 │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│             4. Le Worker                                        │
│     - Prend les tâches une par une dans la file                 │
│     - Pour chaque utilisateur :                                 │
│       * Génère un PDF (CERFA ou Convention)                     │
│       * Sauvegarde le PDF dans MongoDB GridFS                   │
│       * Marquer que le document de l'utilisateur est pret       │
│     - Plusieurs workers travaillent en parallèle (4 par défaut)│
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              5. MongoDB                                         │
│     - Collection "batches" : Liste des lots                     │
│       { batchId: "123", status: "completed", total: 1000 }      │
│     - Collection "documents" : Liste des documents              │
│       { userId: "user1", status: "completed", pdfFileId: ... }  │
│     - GridFS : Les fichiers PDF eux-mêmes                       │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   6. Client (Récupération)                      │
│     - GET /api/documents/batch/123                              │
│     - Réponse : les documents faits et en attentes              │
│                                                                 │
│     - GET /api/documents/doc_123_user1                          │
│     - Réponse : le fichier PDF                                  │
└─────────────────────────────────────────────────────────────────┘


---

## Choix techniques

### Bull pour la gestion de file d'attente

Bull a été choisi car il répond bien aux besoins du projet. Il permet de séparer la réception des requêtes de la génération des PDF, ce qui évite de bloquer l’API quand on traite des lots de 1 000 documents. Il gère tout seul les mécanismes qu’on voulait : trois tentatives avec backoff exponentiel, un timeout à 5 secondes, et une persistance des jobs même en cas de crash. On peut aussi régler facilement le niveau de concurrence pour optimiser l’utilisation du CPU. Enfin, Bull expose des métriques claires sur l’état des jobs (en attente, actif, terminé, en échec), qu’on utilise pour le health check et pour remonter dans Prometheus.

### GridFS pour le stockage des PDF

GridFS a été retenu pour stocker les PDF parce que ça garantit l'atomicité : le fichier et ses métadonnées sont enregistrés dans la même transaction MongoDB, donc pas de risque d'incohérence. Le streaming est natif, ce qui permet d'envoyer le PDF bloc par bloc sans tout charger en mémoire. Ça évite aussi d'ajouter une techno supplémentaire comme S3 ou du stockage fichier, tout reste centralisé dans MongoDB, ce qui simplifie les déploiements et les backups. Enfin, on peut attacher directement des métadonnées (userId, batchId, etc.) à chaque fichier, ce qui rend les requêtes et le debugging bien plus simples.


## Déploiement


```bash
docker-compose up --build
```
Cette commande :
- Construit les images Docker pour l'API et le Worker
- Télécharge les images MongoDB et Redis
- Démarre les 4 conteneurs : MongoDB, Redis, API, Worker
- Affiche les logs dans le terminal

