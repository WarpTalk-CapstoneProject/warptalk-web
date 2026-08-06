import { NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/render";
import React from "react";

import { WorkspaceInvitationEmail } from "@/emails/WorkspaceInvitationEmail";
import { WorkspaceJoinRequestApprovedEmail } from "@/emails/WorkspaceJoinRequestApprovedEmail";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, to, subject, props } = body;

    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { error: "Recipient email 'to' is required." },
        { status: 400 }
      );
    }

    let emailElement: React.ReactElement | null = null;
    let defaultSubject = "WarpTalk Notification";

    if (type === "workspace_invite") {
      defaultSubject = `Join ${props?.workspaceName || "Workspace"} on WarpTalk`;
      emailElement = React.createElement(WorkspaceInvitationEmail, {
        workspaceName: props?.workspaceName,
        inviterName: props?.inviterName,
        roleName: props?.roleName,
        joinUrl: props?.joinUrl,
      });
    } else if (type === "join_request_approved") {
      defaultSubject = `Your request to join ${props?.workspaceName || "Workspace"} was approved`;
      emailElement = React.createElement(WorkspaceJoinRequestApprovedEmail, {
        workspaceName: props?.workspaceName,
        membershipType: props?.membershipType,
        joinUrl: props?.joinUrl,
        recipientEmail: to,
      });
    } else {
      return NextResponse.json(
        { error: `Unknown email type '${type}'.` },
        { status: 400 }
      );
    }

    const emailSubject = subject || defaultSubject;
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL || "WarpTalk <notifications@warptalk.com>";

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const data = await resend.emails.send({
        from: fromAddress,
        to: [to],
        subject: emailSubject,
        react: emailElement,
      });

      if (data.error) {
        return NextResponse.json(
          { error: data.error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        messageId: data.data?.id,
        provider: "resend",
      });
    }

    // Dev mode fallback when RESEND_API_KEY is not configured
    const htmlContent = await render(emailElement);

    return NextResponse.json({
      success: true,
      devMode: true,
      provider: "mock-local-dev",
      message: "RESEND_API_KEY not configured. Rendered React Email successfully.",
      subject: emailSubject,
      to,
      htmlPreviewLength: htmlContent.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
