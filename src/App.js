import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import StockTracker from "./StockTracker";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      region: process.env.REACT_APP_AWS_REGION,
    },
  },
});

const components = {
  Header() {
    return (
      <div style={{
        textAlign: "center",
        padding: "32px 0 8px",
        fontFamily: "'Space Mono', monospace",
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#00e5a0" }}>
          stock<span style={{ color: "#4d7cff" }}>watch</span>
        </div>
        <div style={{ fontSize: 12, color: "#4a5068", marginTop: 6 }}>
          AI-powered stock tracker
        </div>
      </div>
    );
  },
};

const formFields = {
  signIn: {
    username: { placeholder: "Enter your email" },
    password: { placeholder: "Enter your password" },
  },
  signUp: {
    username: { placeholder: "Enter your email", label: "Email" },
    password: { placeholder: "Create a password" },
    confirm_password:{ placeholder: "Confirm your password" },
  },
};

export default function App() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

        /* Override Amplify default styles to match dark theme */
        [data-amplify-authenticator] {
          --amplify-colors-background-primary:   #0b0e14;
          --amplify-colors-background-secondary: #0f1219;
          --amplify-colors-border-primary:       #1e2330;
          --amplify-colors-border-secondary:     #2a3044;
          --amplify-colors-brand-primary-10:     #0d2e1f;
          --amplify-colors-brand-primary-80:     #00e5a0;
          --amplify-colors-brand-primary-90:     #00c988;
          --amplify-colors-brand-primary-100:    #00b077;
          --amplify-colors-font-primary:         #e8eaf0;
          --amplify-colors-font-secondary:       #9aa3c0;
          --amplify-colors-font-interactive:     #4d7cff;
          --amplify-components-button-primary-background-color: #4d7cff;
          --amplify-components-button-primary-hover-background-color: #3a68f0;
          --amplify-components-fieldcontrol-border-color: #1e2330;
          --amplify-components-fieldcontrol-focus-border-color: #4d7cff;
          --amplify-components-fieldcontrol-color: #e8eaf0;
          --amplify-components-fieldcontrol-background-color: #131824;
          min-height: 100vh;
          background: #0b0e14;
        }

        [data-amplify-authenticator] [data-amplify-container] {
          padding-top: 60px;
        }

        /* Style the card */
        .amplify-card {
          background: #0f1219 !important;
          border: 1px solid #1e2330 !important;
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
        }

        /* Tab buttons (Sign In / Create Account) */
        .amplify-tabs-item {
          color: #4a5068 !important;
          font-family: 'DM Sans', sans-serif !important;
        }
        .amplify-tabs-item[data-state=active] {
          color: #00e5a0 !important;
          border-bottom-color: #00e5a0 !important;
        }

        /* Labels */
        .amplify-label {
          color: #9aa3c0 !important;
          font-family: 'DM Sans', sans-serif !important;
          font-size: 13px !important;
        }

        /* Input fields */
        .amplify-input, .amplify-select {
          background: #131824 !important;
          border-color: #1e2330 !important;
          color: #e8eaf0 !important;
          font-family: 'DM Sans', sans-serif !important;
          border-radius: 8px !important;
        }
        .amplify-input:focus {
          border-color: #4d7cff !important;
          box-shadow: 0 0 0 2px rgba(77,124,255,0.15) !important;
        }

        /* Primary button */
        .amplify-button[data-variation=primary] {
          background: #4d7cff !important;
          border: none !important;
          border-radius: 8px !important;
          font-family: 'DM Sans', sans-serif !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          padding: 12px !important;
        }
        .amplify-button[data-variation=primary]:hover {
          background: #3a68f0 !important;
        }

        /* Link buttons */
        .amplify-button[data-variation=link] {
          color: #4d7cff !important;
          font-family: 'DM Sans', sans-serif !important;
        }

        /* Footer text */
        .amplify-text {
          color: #9aa3c0 !important;
          font-family: 'DM Sans', sans-serif !important;
        }

        body { background: #0b0e14; margin: 0; }
      `}</style>

      <Authenticator
        components={components}
        formFields={formFields}
        initialState="signIn"
      >
        {({ signOut, user }) => (
          <StockTracker user={user} onSignOut={signOut} />
        )}
      </Authenticator>
    </>
  );
}