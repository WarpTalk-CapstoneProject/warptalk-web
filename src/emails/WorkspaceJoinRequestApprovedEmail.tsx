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

export interface WorkspaceJoinRequestApprovedEmailProps {
  workspaceName?: string;
  membershipType?: string;
  joinUrl?: string;
  recipientEmail?: string;
}

export const WorkspaceJoinRequestApprovedEmail = ({
  workspaceName = "{{WorkspaceName}}",
  membershipType = "{{MembershipType}}",
  joinUrl = "{{JoinUrl}}",
  recipientEmail,
}: WorkspaceJoinRequestApprovedEmailProps) => {
  const previewText = `Your request to join ${workspaceName} on WarpTalk has been approved!`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>WarpTalk</Text>
          <Text style={header}>Request Approved!</Text>

          <Section style={contentSection}>
            <Text style={paragraph}>Hello,</Text>
            <Text style={paragraph}>
              Great news! Your request to join <strong style={highlight}>{workspaceName}</strong> has been approved as a <span style={roleBadge}>Member</span> with membership type <strong style={highlight}>{membershipType}</strong>.
            </Text>
            <Text style={paragraph}>
              You can now access all shared translation rooms, workspace channels, and AI-powered collaborative artifacts.
            </Text>

            <Section style={btnContainer}>
              <Button style={button} href={joinUrl}>
                Open Workspace
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
            {recipientEmail && `This email was sent to ${recipientEmail}. `}
            If you did not submit this join request, please contact workspace administrators.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default WorkspaceJoinRequestApprovedEmail;

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
  margin: "0 0 16px 0",
  letterSpacing: "-0.5px",
};

const header: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#ffffff",
  margin: "0 0 24px 0",
};

const contentSection: React.CSSProperties = {
  margin: "0 0 24px 0",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#94a3b8",
  margin: "0 0 16px 0",
};

const highlight: React.CSSProperties = {
  color: "#f8fafc",
};

const roleBadge: React.CSSProperties = {
  backgroundColor: "#0284c7",
  color: "#ffffff",
  padding: "2px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  fontWeight: "600",
};

const btnContainer: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "28px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#0284c7",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 28px",
  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
};

const subtext: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#64748b",
  margin: "16px 0 0 0",
};

const linkUrl: React.CSSProperties = {
  color: "#38bdf8",
  wordBreak: "break-all" as const,
};

const hr: React.CSSProperties = {
  borderColor: "#334155",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#64748b",
  margin: "0",
  textAlign: "center" as const,
};
