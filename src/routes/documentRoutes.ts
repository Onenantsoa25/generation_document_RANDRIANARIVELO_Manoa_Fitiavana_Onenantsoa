import { Router } from 'express';
import { createBatch, getBatchStatus } from '../controllers/batchController';
import { getDocument } from '../controllers/documentController';

const router = Router();

/**
 * @swagger
 * /api/documents/batch:
 *   post:
 *     summary: Créer un lot de documents
 *     description: |
 *       Lance la génération asynchrone d'un lot de documents.
 *       Le traitement s'effectue en arrière-plan via une queue Bull.
 *       Retourne immédiatement un batchId pour suivre l'avancement.
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchRequest'
 *           examples:
 *             cerfa:
 *               summary: Génération de CERFA
 *               value:
 *                 userIds: ["user1", "user2", "user3"]
 *                 templateName: "cerfa"
 *             convention:
 *               summary: Génération de conventions
 *               value:
 *                 userIds: ["user1", "user2", "user3"]
 *                 templateName: "convention"
 *             batch1000:
 *               summary: Lot de 1000 documents
 *               value:
 *                 userIds: ["user1", "user2", "user3", "...", "user1000"]
 *                 templateName: "cerfa"
 *     responses:
 *       202:
 *         description: Lot créé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchResponse'
 *             example:
 *               batchId: "batch_550e8400-e29b-41d4-a716-446655440000"
 *               status: "pending"
 *               templateName: "cerfa"
 *               message: "Batch créé avec 3 documents en attente de traitement"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/api/documents/batch', createBatch);

/**
 * @swagger
 * /api/documents/batch/{batchId}:
 *   get:
 *     summary: Récupérer le statut d'un lot
 *     description: |
 *       Retourne le statut actuel du lot et la liste des documents.
 *       Permet de suivre l'avancement de la génération asynchrone.
 *     tags: [Documents]
 *     parameters:
 *       - $ref: '#/components/parameters/batchIdParam'
 *     responses:
 *       200:
 *         description: Statut du lot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchStatusResponse'
 *             examples:
 *               processing:
 *                 summary: Lot en cours de traitement
 *                 value:
 *                   batchId: "batch_550e8400-e29b-41d4-a716-446655440000"
 *                   status: "processing"
 *                   totalDocuments: 1000
 *                   processedDocuments: 450
 *                   failedDocuments: 5
 *                   documents: [
 *                     { "documentId": "doc_1704067200000_user1", "userId": "user1", "status": "completed" },
 *                     { "documentId": null, "userId": "user2", "status": "pending" },
 *                     { "documentId": null, "userId": "user3", "status": "failed", "error": "Timeout" }
 *                   ]
 *               completed:
 *                 summary: Lot terminé avec succès
 *                 value:
 *                   batchId: "batch_550e8400-e29b-41d4-a716-446655440000"
 *                   status: "completed"
 *                   totalDocuments: 1000
 *                   processedDocuments: 998
 *                   failedDocuments: 2
 *                   documents: [...]
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/api/documents/batch/:batchId', getBatchStatus);

/**
 * @swagger
 * /api/documents/{documentId}:
 *   get:
 *     summary: Télécharger un document PDF
 *     description: |
 *       Retourne le fichier PDF généré pour un document.
 *       Le document doit être en statut "completed".
 *     tags: [Documents]
 *     parameters:
 *       - $ref: '#/components/parameters/documentIdParam'
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *             example: "PDF content"
 *       400:
 *         description: Document non encore généré
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Document non encore généré (status: pending)"
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/api/documents/:documentId', getDocument);

export default router;