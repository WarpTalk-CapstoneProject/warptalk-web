import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from '@react-email/render';
import { WorkspaceInvitationEmail } from '../src/emails/WorkspaceInvitationEmail';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportEmailTemplates() {
  console.log('Rendering React Email Templates...');
  
  const html = await render(
    React.createElement(WorkspaceInvitationEmail, {
      workspaceName: '{{WorkspaceName}}',
      inviterName: '{{InviterName}}',
      roleName: '{{RoleName}}',
      joinUrl: '{{JoinUrl}}',
    }),
    { pretty: true }
  );

  const outputDir = path.join(__dirname, '..', 'public', 'templates');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const cleanedHtml = html.replace(/&#x27;/g, "'");

  const outputPath = path.join(outputDir, 'workspace-invitation-email.html');
  fs.writeFileSync(outputPath, cleanedHtml, 'utf-8');
  console.log(`Successfully exported HTML email template to: ${outputPath}`);
}

exportEmailTemplates().catch((err) => {
  console.error('Failed to export email templates:', err);
  process.exit(1);
});
