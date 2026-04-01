import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PDF Generator Service API',
      version: '1.0.0',
      description: `
        Service de génération de documents (CERFA, conventions) capable de traiter 
        des lots de 1000 documents en parallèle, avec résilience et monitoring.
        
        ## Fonctionnalités
        - Génération asynchrone de documents PDF
        - Traitement par lots avec queue Bull (Redis)
        - Worker séparé pour la génération PDF
        - Gestion des erreurs avec retry (3 tentatives, backoff exponentiel)
        - Stockage MongoDB avec GridFS
        - Métriques Prometheus
        - Logs structurés JSON
        - Circuit breaker pour les appels externes
        - Health checks complets
        - Graceful shutdown
      `,
      contact: {
        name: 'API Support',
        email: 'support@pdf-generator.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'http://api:3000',
        description: 'Docker internal server'
      }
    ],
    tags: [
      {
        name: 'Documents',
        description: 'Opérations de génération et récupération de documents'
      },
      {
        name: 'Batches',
        description: 'Gestion des lots de documents'
      },
      {
        name: 'Monitoring',
        description: 'Métriques et health checks'
      },
      {
        name: 'Admin',
        description: 'Endpoints d\'administration'
      }
    ],
    components: {
      schemas: {
        BatchRequest: {
          type: 'object',
          required: ['userIds'],
          properties: {
            userIds: {
              type: 'array',
              items: {
                type: 'string',
                example: 'user123'
              },
              minItems: 1,
              maxItems: 1000,
              description: 'Liste des identifiants utilisateurs',
              example: ['user1', 'user2', 'user3']
            },
            templateName: {
              type: 'string',
              enum: ['cerfa', 'convention'],
              default: 'cerfa',
              description: 'Type de document à générer',
              example: 'cerfa'
            }
          }
        },
        BatchResponse: {
          type: 'object',
          properties: {
            batchId: {
              type: 'string',
              description: 'Identifiant unique du lot',
              example: 'batch_550e8400-e29b-41d4-a716-446655440000'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed'],
              description: 'Statut du lot',
              example: 'pending'
            },
            templateName: {
              type: 'string',
              description: 'Type de document',
              example: 'cerfa'
            },
            message: {
              type: 'string',
              description: 'Message de confirmation',
              example: 'Batch créé avec 3 documents en attente de traitement'
            }
          }
        },
        BatchStatusResponse: {
          type: 'object',
          properties: {
            batchId: {
              type: 'string',
              example: 'batch_550e8400-e29b-41d4-a716-446655440000'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed'],
              example: 'processing'
            },
            totalDocuments: {
              type: 'integer',
              description: 'Nombre total de documents dans le lot',
              example: 1000
            },
            processedDocuments: {
              type: 'integer',
              description: 'Nombre de documents traités avec succès',
              example: 450
            },
            failedDocuments: {
              type: 'integer',
              description: 'Nombre de documents en échec',
              example: 5
            },
            documents: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/DocumentInfo'
              }
            }
          }
        },
        DocumentInfo: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: 'Identifiant du document (null si non généré)',
              example: 'doc_1704067200000_user123',
              nullable: true
            },
            userId: {
              type: 'string',
              description: 'Identifiant de l\'utilisateur',
              example: 'user123'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed'],
              example: 'completed'
            },
            error: {
              type: 'string',
              description: 'Message d\'erreur (si status=failed)',
              example: 'Timeout: génération PDF > 5s',
              nullable: true
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Message d\'erreur',
              example: 'userIds est requis et doit être un tableau non vide'
            }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ok', 'degraded'],
              example: 'ok'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2026-04-01T10:00:00.000Z'
            },
            uptime: {
              type: 'number',
              description: 'Temps de fonctionnement en secondes',
              example: 3600.5
            },
            services: {
              type: 'object',
              properties: {
                mongodb: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['up', 'down'] },
                    latency: { type: 'number' }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['up', 'down'] },
                    latency: { type: 'number' }
                  }
                },
                queue: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['up', 'down'] },
                    waiting: { type: 'number' },
                    active: { type: 'number' },
                    completed: { type: 'number' },
                    failed: { type: 'number' }
                  }
                },
                circuitBreaker: {
                  type: 'object',
                  properties: {
                    state: { type: 'string', enum: ['CLOSED', 'OPEN', 'HALF_OPEN'] },
                    failureCount: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      },
      parameters: {
        batchIdParam: {
          name: 'batchId',
          in: 'path',
          required: true,
          description: 'Identifiant du lot',
          schema: {
            type: 'string'
          },
          example: 'batch_550e8400-e29b-41d4-a716-446655440000'
        },
        documentIdParam: {
          name: 'documentId',
          in: 'path',
          required: true,
          description: 'Identifiant du document',
          schema: {
            type: 'string'
          },
          example: 'doc_1704067200000_user123'
        }
      },
      responses: {
        BadRequest: {
          description: 'Requête invalide',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        },
        NotFound: {
          description: 'Ressource non trouvée',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        },
        InternalError: {
          description: 'Erreur interne du serveur',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'] 
};

export const swaggerSpec = swaggerJsdoc(options);