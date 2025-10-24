import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  User,
  Shield,
  Wallet,
  Phone,
  IdCard,
  Image,
  FileText,
  CheckCircle,
  Upload,
} from "lucide-react";
import { useState } from "react";

const Settings = () => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const handleDocumentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append(type, file);

    try {
      const response = await fetch("/api/user/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        // Refresh user data
        window.location.reload();
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gold-gradient mb-2">Profile</h1>
        <p className="text-muted-foreground">
          View and manage your account information
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <GlassCard className="lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-gold" />
            Personal Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Full Name</p>
              <p className="font-medium">{user?.fullName || "Not provided"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email || "Not provided"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone Number</p>
              <p className="font-medium">{user?.phone || "Not provided"}</p>
            </div>
          </div>
        </GlassCard>

        {/* Wallet Information */}
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-gold" />
            Wallet Information
          </h3>
          <div>
            <p className="text-sm text-muted-foreground">Wallet Address</p>
            <p className="font-mono text-sm break-all">
              {user?.walletAddress || "Not available"}
            </p>
          </div>
        </GlassCard>

        {/* Verification Status */}
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold" />
            Verification Status
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>KYC Verification</span>
              <span
                className={
                  user?.kycVerified
                    ? "text-green-400 flex items-center gap-1"
                    : "text-red-400 flex items-center gap-1"
                }
              >
                {user?.kycVerified ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Verified
                  </>
                ) : (
                  "Not Verified"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Face Verification</span>
              <span
                className={
                  user?.faceVerified
                    ? "text-green-400 flex items-center gap-1"
                    : "text-red-400 flex items-center gap-1"
                }
              >
                {user?.faceVerified ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Verified
                  </>
                ) : (
                  "Not Verified"
                )}
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Aadhar Card */}
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <IdCard className="w-5 h-5 text-gold" />
            Aadhar Card
          </h3>
          <div className="space-y-2">
            <div className="border border-glass-border rounded-lg p-4 flex items-center justify-center min-h-[150px] bg-muted/10">
              {user?.aadharDocument ? (
                <div className="text-center">
                  <img
                    src={user.aadharDocument}
                    alt="Aadhar Document"
                    className="max-h-32 mx-auto rounded"
                  />
                  <p className="text-sm font-medium mt-2">Aadhar Card</p>
                </div>
              ) : user?.kycVerified ? (
                <div className="text-center">
                  <IdCard className="w-12 h-12 text-gold mx-auto mb-2" />
                  <p className="text-sm font-medium">Aadhar Card Verified</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Document successfully uploaded and verified
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <IdCard className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No Aadhar card uploaded
                  </p>
                  <label className="mt-2 cursor-pointer">
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={uploading}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "Uploading..." : "Upload Document"}
                    </Button>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) =>
                        handleDocumentUpload(e, "aadharDocument")
                      }
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Face Verification */}
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Image className="w-5 h-5 text-gold" />
            Face Verification
          </h3>
          <div className="space-y-2">
            <div className="border border-glass-border rounded-lg p-4 flex items-center justify-center min-h-[150px] bg-muted/10">
              {user?.faceImage ? (
                <div className="text-center">
                  <img
                    src={user.faceImage}
                    alt="Face Capture"
                    className="max-h-32 mx-auto rounded-full"
                  />
                  <p className="text-sm font-medium mt-2">Face Capture</p>
                </div>
              ) : user?.faceVerified ? (
                <div className="text-center">
                  <User className="w-12 h-12 text-gold mx-auto mb-2" />
                  <p className="text-sm font-medium">Face Verified</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Biometric data captured and verified
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No face capture available
                  </p>
                  <label className="mt-2 cursor-pointer">
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={uploading}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "Capturing..." : "Capture Face"}
                    </Button>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleDocumentUpload(e, "faceImage")}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Documents */}
        <GlassCard className="lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold" />
            Documents
          </h3>
          <div className="space-y-2">
            <div className="border border-glass-border rounded-lg p-4 flex items-center justify-center min-h-[150px] bg-muted/10">
              {user?.aadharDocument || user?.faceImage ? (
                <div className="text-center">
                  <FileText className="w-12 h-12 text-gold mx-auto mb-2" />
                  <p className="text-sm font-medium">Documents Uploaded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {user?.aadharDocument && user?.faceImage
                      ? "Aadhar card and face capture uploaded"
                      : user?.aadharDocument
                      ? "Aadhar card uploaded"
                      : "Face capture uploaded"}
                  </p>
                </div>
              ) : user?.kycVerified ? (
                <div className="text-center">
                  <FileText className="w-12 h-12 text-gold mx-auto mb-2" />
                  <p className="text-sm font-medium">Documents Verified</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All required documents have been verified
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No documents uploaded
                  </p>
                  <div className="flex gap-2 justify-center mt-2">
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" disabled={uploading}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Aadhar
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) =>
                          handleDocumentUpload(e, "aadharDocument")
                        }
                        disabled={uploading}
                      />
                    </label>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" disabled={uploading}>
                        <Upload className="w-4 h-4 mr-2" />
                        Capture Face
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleDocumentUpload(e, "faceImage")}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Settings;
