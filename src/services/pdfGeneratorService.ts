import PDFDocument from 'pdfkit';
import { getGridFSBucket } from '../config/database';
import mongoose from 'mongoose';

const templateCache = new Map();

const cerfaTemplate = (doc: any, data: any) => {
  doc.fontSize(10)
    .text('CERFA N° 13750*03', { align: 'right' })
    .moveDown();
  
  doc.fontSize(16)
    .font('Helvetica-Bold')
    .text('DEMANDE DE LOGEMENT SOCIAL', { align: 'center' })
    .moveDown(2);
  
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('1. IDENTITÉ DU DEMANDEUR', { underline: true })
    .moveDown(0.5);
  
  doc.fontSize(10)
    .font('Helvetica')
    .text(`Identifiant: ${data.userId}`)
    .text(`Nom: DUPONT`)
    .text(`Prénom: Jean`)
    .text(`Date de naissance: 01/01/1990`)
    .moveDown();
  
  doc.fontSize(10)
    .text(`Fait à Paris, le ${new Date().toLocaleDateString()}`, { align: 'center' })
    .moveDown();
  
  doc.text('Signature: _________________________', { align: 'center' });
};

const conventionTemplate = (doc: any, data: any) => {
  doc.fontSize(18)
    .font('Helvetica-Bold')
    .text('CONVENTION DE STAGE', { align: 'center' })
    .moveDown(2);
  
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('Entre les soussignés :', { underline: true })
    .moveDown(0.5);
  
  doc.fontSize(10)
    .font('Helvetica')
    .text(`L'organisme d'accueil : ENTREPRISE SAS`)
    .text(`Adresse : 15 avenue de l'Entreprise, 75002 Paris`)
    .moveDown();
  
  doc.fontSize(10)
    .font('Helvetica')
    .text(`L'étudiant(e) : ${data.userId}`)
    .moveDown(2);
  
  doc.fontSize(10)
    .text(`Fait à Paris, le ${new Date().toLocaleDateString()}`, { align: 'center' })
    .moveDown(2);
  
  doc.text('Signature de l\'étudiant(e)', 100, doc.y)
    .text('Signature du tuteur', 400, doc.y);
};

const getTemplate = (templateName: string) => {
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }
  
  let template;
  if (templateName === 'cerfa') {
    template = cerfaTemplate;
  } else if (templateName === 'convention') {
    template = conventionTemplate;
  } else {
    throw new Error(`Template ${templateName} non trouvé`);
  }
  
  templateCache.set(templateName, template);
  console.log(` Template ${templateName} chargé en cache`);
  
  return template;
};

export const generatePDF = async (
  userId: string, 
  documentId: string, 
  templateName: string = 'cerfa'
): Promise<mongoose.Types.ObjectId> => {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    try {
      const template = getTemplate(templateName);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const bucket = getGridFSBucket();
      const uploadStream = bucket.openUploadStream(`doc_${documentId}.pdf`, {
        metadata: { userId, documentId, template: templateName, generatedAt: new Date() }
      });
      
      doc.pipe(uploadStream);
      template(doc, { userId, documentId });
      doc.end();
      
      uploadStream.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(` PDF ${documentId} généré en ${duration}ms`);
        resolve(uploadStream.id);
      });
      
      uploadStream.on('error', (err: Error) => {
        reject(err);
      });
      
    } catch (error) {
      reject(error);
    }
  });
};

export const preloadTemplates = () => {
  getTemplate('cerfa');
  getTemplate('convention');
  console.log('Templates préchargés');
};