import { useState, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, FileText, CheckCircle, XCircle, Upload, Eye, Link, Database, Globe } from "lucide-react";
import { toast } from "sonner";
import { documentApi, blockchainApi, enhancedAuthApi } from "@/lib/api";

interface DocumentUploadResult {
  success: boolean;
  data?: {
    documents?: Array<{
      id: string;
      type: string;
      hash: string;
      uploadedAt: string;
    }>;
    user?: {
      aadharDocument: string;
      faceImage: string;
      aadharHash: string;
    };
  };
  error?: string;
}

interface BlockchainVerificationResult {
  success: boolean;
  data?: {
    document?: {
      id: string;
      documentHash: string;
      verificationStatus: string;
    };
    blockchain?: {
      verified: boolean;
      txHash: string;
      contractAddress: string;
      network: string;
    };
  };
  error?: string;
}

const ValidateDocuments = () => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    aadharNumber: "",
    role: "Borrower" as "Borrower" | "Lender",
  });

  const [aadharFile, setAadharFile] = useState<File | null>(null);
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<DocumentUploadResult | null>(null);
  const [blockchainResult, setBlockchainResult] = useState<BlockchainVerificationResult | null>(null);
  const [blockchainInfo, setBlockchainInfo] = useState<{
    currentNetwork: string;
    contractAddress: string;
    mockMode: boolean;
    blockExplorer: string;
  } | null>(null);

  const aadharInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);

  // Get blockchain info on component mount
  useState(() => {
    const getBlockchainInfo = async () => {
      try {
        const result = await blockchainApi.getNetworkInfo();
        if (result.success && result.data) {
          setBlockchainInfo(result.data as {
            currentNetwork: string;
            contractAddress: string;
            mockMode: boolean;
            blockExplorer: string;
          });
        }
      } catch (error) {
        console.error('Failed to get blockchain info:', error);
      }
    };
    getBlockchainInfo();
  });

  const handleFileSelect = (type: 'aadhar' | 'face', file: File) => {
    if (type === 'aadhar') {
      setAadharFile(file);
    } else {
      setFaceFile(file);
    }
    toast.success(`${type === 'aadhar' ? 'Aadhar' : 'Face'} file selected: ${file.name}`);
  };

  const handleUpload = async () => {
    if (!aadharFile || !faceFile) {
      toast.error("Please select both Aadhar and Face image files");
      return;
    }

    if (!formData.fullName || !formData.email || !formData.phone || !formData.aadharNumber) {
      toast.error("Please fill in all user details");
      return;
    }

    setLoading(true);
    try {
      // First register the user
      const registerResult = await enhancedAuthApi.register({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        aadharNumber: formData.aadharNumber,
      });

      if (!registerResult.success) {
        throw new Error(registerResult.error || 'Registration failed');
      }

      // Create FormData for file upload
      const uploadFormData = new FormData();
      uploadFormData.append('aadharDocument', aadharFile);
      uploadFormData.append('faceImage', faceFile);

      // Upload documents
      const uploadResult = await documentApi.upload(uploadFormData);

      if (uploadResult.success) {
        setUploadResult(uploadResult);
        toast.success("Documents uploaded and verified successfully!");

        // Show blockchain information
        if (uploadResult.data?.user?.aadharHash) {
          toast.info("Document hash generated and ready for blockchain verification");
        }
      } else {
        throw new Error(uploadResult.error || 'Upload failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      toast.error(errorMessage);
      setUploadResult({ success: false, error: errorMessage });
    }
    setLoading(false);
  };

  const handleBlockchainVerification = async () => {
    if (!uploadResult?.data?.documents?.[0]?.hash) {
      toast.error("No document hash available for blockchain verification");
      return;
    }

    setLoading(true);
    try {
      const result = await blockchainApi.verifyDocument(uploadResult.data.documents[0].hash);

      if (result.success && result.data) {
        setBlockchainResult({ success: true, data: result.data });
        toast.success("Document verified on blockchain successfully!");

        // Show blockchain transaction details
        if (result.data.blockchain?.txHash) {
          toast.info(`Transaction: ${result.data.blockchain.txHash}`);
        }
      } else {
        setBlockchainResult({ success: false, error: result.error || "Blockchain verification failed" });
        toast.error(result.error || "Blockchain verification failed");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Blockchain verification failed";
      toast.error(errorMessage);
      setBlockchainResult({ success: false, error: errorMessage });
    }
    setLoading(false);
  };

  const handleViewOnBlockchain = () => {
    if (blockchainResult?.data?.blockchain?.txHash && blockchainInfo?.blockExplorer) {
      const url = `${blockchainInfo.blockExplorer}/tx/${blockchainResult.data.blockchain.txHash}`;
      window.open(url, '_blank');
    } else {
      toast.error("No blockchain transaction available");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-gold" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gold-gradient">
            Enhanced Document Validation
          </h1>
          <p className="text-muted-foreground">
            Upload documents with blockchain verification and SHA-256 double hashing
          </p>
        </div>
      </div>

      {/* Blockchain Status */}
      {blockchainInfo && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold">Blockchain Status</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Network:</span>
              <p className="font-medium">{blockchainInfo.currentNetwork}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Contract:</span>
              <p className="font-medium text-xs">{blockchainInfo.contractAddress?.substring(0, 10)}...</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <p className="font-medium text-green-400">Connected</p>
            </div>
            <div>
              <span className="text-muted-foreground">Mode:</span>
              <p className="font-medium">{blockchainInfo.mockMode ? 'Mock' : 'Live'}</p>
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard className="space-y-6">
        {/* User Information */}
        <div>
          <h3 className="text-lg font-semibold mb-4">User Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="Enter full name"
                className="glass-panel border-glass-border"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                className="glass-panel border-glass-border"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="9876543210"
                className="glass-panel border-glass-border"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aadharNumber">Aadhaar Number</Label>
              <Input
                id="aadharNumber"
                placeholder="123456789012"
                className="glass-panel border-glass-border"
                value={formData.aadharNumber}
                onChange={(e) => setFormData({ ...formData, aadharNumber: e.target.value })}
                maxLength={12}
              />
            </div>
          </div>
        </div>

        {/* Document Upload */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Document Upload</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Aadhar Document</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-gold/40"
                  onClick={() => aadharInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {aadharFile ? aadharFile.name : 'Select Aadhar'}
                </Button>
                {aadharFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAadharFile(null)}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input
                ref={aadharInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect('aadhar', e.target.files[0])}
              />
            </div>

            <div className="space-y-2">
              <Label>Face Image</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-gold/40"
                  onClick={() => faceInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {faceFile ? faceFile.name : 'Select Face Image'}
                </Button>
                {faceFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFaceFile(null)}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input
                ref={faceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect('face', e.target.files[0])}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={loading || !aadharFile || !faceFile}
            className="bg-gold-gradient text-background"
          >
            {loading ? "Processing..." : "Upload & Verify Documents"}
          </Button>

          {uploadResult?.success && (
            <Button
              onClick={handleBlockchainVerification}
              disabled={loading}
              variant="outline"
              className="border-gold/40"
            >
              <Link className="w-4 h-4 mr-2" />
              Verify on Blockchain
            </Button>
          )}

          {blockchainResult?.success && (
            <Button
              onClick={handleViewOnBlockchain}
              variant="outline"
              className="border-green-400/40"
            >
              <Eye className="w-4 h-4 mr-2" />
              View on Blockchain
            </Button>
          )}
        </div>

        {/* Upload Results */}
        {uploadResult && (
          <div className="mt-4 p-4 rounded-lg glass-panel">
            <div className="flex items-center gap-2 mb-3">
              {uploadResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <h3 className="font-semibold">
                {uploadResult.success ? "Upload Successful" : "Upload Failed"}
              </h3>
            </div>

            {uploadResult.success ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <strong>Documents:</strong> {uploadResult.data?.documents?.length || 0} uploaded
                </p>
                {uploadResult.data?.documents?.map((doc, index) => (
                  <div key={index} className="bg-background/20 p-2 rounded">
                    <p><strong>Type:</strong> {doc.type}</p>
                    <p><strong>Hash:</strong> <code className="text-xs">{doc.hash.substring(0, 16)}...</code></p>
                    <p><strong>Algorithm:</strong> SHA-256 Double Hash</p>
                  </div>
                ))}
                <p className="text-green-400 font-medium">
                  ✅ Documents processed with enhanced security
                </p>
              </div>
            ) : (
              <p className="text-sm text-red-400">
                {uploadResult.error || "Unknown error occurred"}
              </p>
            )}
          </div>
        )}

        {/* Blockchain Verification Results */}
        {blockchainResult && (
          <div className="mt-4 p-4 rounded-lg glass-panel">
            <div className="flex items-center gap-2 mb-3">
              {blockchainResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <h3 className="font-semibold">
                {blockchainResult.success ? "Blockchain Verification Successful" : "Blockchain Verification Failed"}
              </h3>
            </div>

            {blockchainResult.success ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <strong>Transaction Hash:</strong>
                  <code className="text-xs ml-2">{blockchainResult.data?.blockchain?.txHash || 'N/A'}</code>
                </p>
                <p className="text-muted-foreground">
                  <strong>Network:</strong> {blockchainResult.data?.blockchain?.network || 'N/A'}
                </p>
                <p className="text-muted-foreground">
                  <strong>Contract:</strong> {blockchainResult.data?.blockchain?.contractAddress || 'N/A'}
                </p>
                <p className="text-green-400 font-medium">
                  ✅ Document hash stored on blockchain permanently
                </p>
                <p className="text-blue-400 text-xs">
                  🔗 View on PolygonScan: https://amoy.polygonscan.com/tx/{blockchainResult.data?.blockchain?.txHash}
                </p>
              </div>
            ) : (
              <p className="text-sm text-red-400">
                {blockchainResult.error || "Unknown error occurred"}
              </p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default ValidateDocuments;
