import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Section,
  Hr,
  Preview,
} from "@react-email/components";

export interface WorkspaceInvitationEmailProps {
  workspaceName?: string;
  inviterName?: string;
  roleName?: string;
  joinUrl?: string;
}

export const WorkspaceInvitationEmail = ({
  workspaceName = "{{WorkspaceName}}",
  inviterName = "{{InviterName}}",
  roleName = "{{RoleName}}",
  joinUrl = "{{JoinUrl}}",
}: WorkspaceInvitationEmailProps) => {
  const previewText = `${inviterName} invited you to join ${workspaceName} on WarpTalk`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>WarpTalk</Text>
          <Text style={header}>Join {workspaceName} on WarpTalk</Text>

          <Section style={contentSection}>
            <Text style={paragraph}>Hello,</Text>
            <Text style={paragraph}>
              <strong style={highlight}>{inviterName}</strong> has invited you to join the{" "}
              <strong style={highlight}>{workspaceName}</strong> workspace as a{" "}
              <span style={roleBadge}>{roleName}</span>.
            </Text>
            <Text style={paragraph}>
              WarpTalk is an AI-powered real-time translation and collaboration platform built for high-performing teams.
            </Text>

            <Section style={btnContainer}>
              <Button style={button} href={joinUrl}>
                Accept & Join Workspace
              </Button>
            </Section>

            <Text style={subtext}>
              If the button above does not work, copy and paste this URL into your web browser:
              <br />
              <a href={joinUrl} style={linkUrl}>
                {joinUrl}
              </a>
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            &copy; {new Date().getFullYear()} WarpTalk Capstone Project. All rights reserved.
            <br />
            If you did not expect this invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default WorkspaceInvitationEmail;

// Inline styles for universal mail client compatibility (Gmail, Outlook, Apple Mail)
const main: React.CSSProperties = {
  backgroundColor: "#0f172a",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  padding: "40px 16px",
  color: "#f8fafc",
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "36px 32px",
  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
};

const logo: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "800",
  color: "#38bdf8",
  letterSpacing: "-0.5px",
  margin: "0 0 24px 0",
};

const header: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "700",
  color: "#f8fafc",
  margin: "0 0 20px 0",
  lineHeight: "1.3",
};

const contentSection: React.CSSProperties = {
  margin: "0 0 28px 0",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#cbd5e1",
  margin: "0 0 16px 0",
};

const highlight: React.CSSProperties = {
  color: "#f8fafc",
  fontWeight: "600",
};

const roleBadge: React.CSSProperties = {
  backgroundColor: "#0284c7",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: "600",
  padding: "3px 8px",
  borderRadius: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const btnContainer: React.CSSProperties = {
  margin: "28px 0",
  textAlign: "left",
};

const button: React.CSSProperties = {
  backgroundColor: "#2563eb",
  backgroundImage: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
  color: "#ffffff",
  fontWeight: "600",
  textDecoration: "none",
  padding: "14px 28px",
  borderRadius: "8px",
  fontSize: "15px",
  display: "inline-block",
  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
};

const subtext: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.5",
  color: "#94a3b8",
  margin: "20px 0 0 0",
};

const linkUrl: React.CSSProperties = {
  color: "#38bdf8",
  wordBreak: "break-all",
  textDecoration: "underline",
};

const hr: React.CSSProperties = {
  borderColor: "#334155",
  margin: "28px 0",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.5",
  color: "#64748b",
  margin: "0",
};
