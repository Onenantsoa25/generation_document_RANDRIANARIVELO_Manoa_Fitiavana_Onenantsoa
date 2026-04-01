import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check complet
 *     description: |
 *       Vérifie l'état de tous les services :
 *       - MongoDB (connexion et latence)
 *       - Redis (connexion et latence)
 *       - Queue Bull (statistiques)
 *       - Circuit Breaker (état)
 *       - Fallbacks (MongoDB local, Redis mémoire)
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Tous les services sont opérationnels
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Certains services sont dégradés
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get('/health', (req, res) => {});

/**
 * @swagger
 * /health/simple:
 *   get:
 *     summary: Health check simple
 *     description: Vérification basique que l'API répond
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: API opérationnelle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health/simple', (req, res) => {});

/**
 * @swagger
 * /health/liveness:
 *   get:
 *     summary: Liveness probe
 *     description: Probe de liveness pour Kubernetes
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Application vivante
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: alive
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health/liveness', (req, res) => {});

/**
 * @swagger
 * /health/readiness:
 *   get:
 *     summary: Readiness probe
 *     description: Probe de readiness pour Kubernetes
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Application prête à recevoir du trafic
 *       503:
 *         description: Application pas encore prête
 */
router.get('/health/readiness', (req, res) => {});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Métriques Prometheus
 *     description: |
 *       Expose les métriques au format Prometheus :
 *       - documents_generated_total (compteur par status et template)
 *       - batch_processing_duration_seconds (histogramme)
 *       - queue_size (gauge par type)
 *       - pdf_generation_duration_seconds (histogramme)
 *       - mongodb_connection_status
 *       - redis_connection_status
 *       - circuit_breaker_state
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Métriques au format Prometheus
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *             example: |
 *               # HELP documents_generated_total Total number of documents generated
 *               # TYPE documents_generated_total counter
 *               documents_generated_total{status="completed",template="cerfa"} 1250
 *               documents_generated_total{status="failed",template="cerfa"} 15
 */
router.get('/metrics', (req, res) => {});

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Dashboard HTML
 *     description: Dashboard simple en HTML avec les métriques clés
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Page HTML du dashboard
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/dashboard', (req, res) => {});

export default router;