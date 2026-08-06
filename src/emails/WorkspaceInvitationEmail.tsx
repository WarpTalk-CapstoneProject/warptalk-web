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
          {/* Logo Header */}
          <Section style={headerSection}>
            <Text style={logoText}>
              WarpTalk<span style={logoDot}>.</span>
            </Text>
          </Section>

          {/* Heading */}
          <Text style={heading}>You&apos;ve been invited to join {workspaceName}</Text>

          {/* Main Body */}
          <Section style={contentSection}>
            <Text style={paragraph}>Hello,</Text>
            <Text style={paragraph}>
              <strong style={strongText}>{inviterName}</strong> has invited you to join the{" "}
              <strong style={strongText}>{workspaceName}</strong> workspace as a{" "}
              <span style={roleBadge}>{roleName}</span>.
            </Text>
            <Text style={descriptionText}>
              WarpTalk is an AI-powered real-time translation and collaboration platform built for high-performing teams.
            </Text>

            {/* CTA Button */}
            <Section style={btnContainer}>
              <Button style={button} href={joinUrl}>
                Accept & Join Workspace &rarr;
              </Button>
            </Section>

            {/* Link Box */}
            <Section style={linkBox}>
              <Text style={linkBoxLabel}>
                Or copy and paste this link into your browser:
              </Text>
              <Text style={linkBoxUrl}>{joinUrl}</Text>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Text style={footer}>
            This invitation link was sent to you by WarpTalk. If you were not expecting this invitation, you can safely ignore this email.
            <br />
            <br />
            &copy; {new Date().getFullYear()} WarpTalk Inc. &bull; Real-time AI Workspace Collaboration
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default WorkspaceInvitationEmail;

// Anthropic-style Warm Minimalist Email Theme
const main: React.CSSProperties = {
  backgroundColor: "#FBF9F5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "48px 16px",
  margin: 0,
};

const container: React.CSSProperties = {
  maxWidth: "540px",
  margin: "0 auto",
  backgroundColor: "#FFFFFF",
  border: "1px solid #E4E4E7",
  borderRadius: "16px",
  padding: "40px 36px",
  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)",
};

const headerSection: React.CSSProperties = {
  marginBottom: "28px",
};

const logoText: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#18181B",
  letterSpacing: "-0.5px",
  margin: 0,
};

const logoDot: React.CSSProperties = {
  color: "#D97757",
  fontWeight: "900",
};

const heading: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#18181B",
  margin: "0 0 20px 0",
  lineHeight: "1.3",
  letterSpacing: "-0.3px",
};

const contentSection: React.CSSProperties = {
  margin: "0 0 20px 0",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#3F3F46",
  margin: "0 0 16px 0",
};

const descriptionText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#71717A",
  margin: "0 0 28px 0",
};

const strongText: React.CSSProperties = {
  color: "#18181B",
  fontWeight: "600",
};

const roleBadge: React.CSSProperties = {
  backgroundColor: "#F4F4F5",
  border: "1px solid #E4E4E7",
  color: "#18181B",
  fontSize: "13px",
  fontWeight: "600",
  padding: "2px 8px",
  borderRadius: "6px",
};

const btnContainer: React.CSSProperties = {
  margin: "32px 0",
  textAlign: "left",
};

const button: React.CSSProperties = {
  backgroundColor: "#18181B",
  color: "#FFFFFF",
  fontWeight: "600",
  textDecoration: "none",
  padding: "14px 28px",
  borderRadius: "10px",
  fontSize: "14px",
  display: "inline-block",
  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
};

const linkBox: React.CSSProperties = {
  backgroundColor: "#FAFAFA",
  border: "1px solid #F4F4F5",
  borderRadius: "10px",
  padding: "16px",
  margin: "24px 0",
};

const linkBoxLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "500",
  color: "#71717A",
  margin: "0 0 6px 0",
};

const linkBoxUrl: React.CSSProperties = {
  fontSize: "13px",
  color: "#D97757",
  wordBreak: "break-all",
  margin: 0,
};

const hr: React.CSSProperties = {
  borderColor: "#F4F4F5",
  margin: "32px 0 24px 0",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.6",
  color: "#A1A1AA",
  margin: 0,
};
