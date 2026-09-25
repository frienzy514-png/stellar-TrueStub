'use client';

import React, { useState, useEffect } from 'react';
import { ISupportedWallet } from '@creit.tech/stellar-wallets-kit';
import { kit } from '../constants/wallet-kit.constant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  CheckCircle, 
  Download, 
  ExternalLink, 
  RefreshCw,
  QrCode
} from 'lucide-react';

interface WalletSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletSelected: (wallet: ISupportedWallet) => void;
}

interface WalletInfo extends ISupportedWallet {
  isInstalled: boolean;
}

export const WalletSelectionModal: React.FC<WalletSelectionModalProps> = ({
  isOpen,
  onClose,
  onWalletSelected
}) => {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletInfo | null>(null);

  // Load supported wallets
  const loadWallets = async () => {
    try {
      setLoading(true);
      const supportedWallets = await kit.getSupportedWallets();      
      const enhancedWallets = supportedWallets.map(wallet => ({
        ...wallet,
        isInstalled: wallet.isAvailable
      }));
      
      setWallets(enhancedWallets);
    } catch (error) {
      console.error('Error loading wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWallets();
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (selectedWallet) {
          setSelectedWallet(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedWallet, onClose]);

  const handleWalletClick = async (wallet: WalletInfo) => {
    if (wallet.isInstalled) {
      onWalletSelected(wallet);
    } else {
      setSelectedWallet(wallet);
    }
  };

  const getBrowserInfo = () => {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor);
    const isFirefox = /Firefox/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && /Apple Computer/.test(navigator.vendor);
    const isEdge = /Edg/.test(userAgent);

    return { isMobile, isChrome, isFirefox, isSafari, isEdge };
  };

  const getInstallationSteps = (wallet: WalletInfo) => {
    const { isMobile, isChrome, isFirefox, isSafari } = getBrowserInfo();
    
    const steps = {
      freighter: isMobile ? [
        'Freighter is a browser extension',
        'Please use a desktop browser',
        'Or try Albedo (web wallet)',
        'No installation required for Albedo'
      ] : [
        isChrome ? 'Go to Chrome Web Store' : 
        isFirefox ? 'Go to Firefox Add-ons' :
        isSafari ? 'Go to Mac App Store' :
        'Go to Freighter website',
        'Click "Install Extension"',
        'Add to your browser',
        'Create or import a wallet',
        'Return here and try again'
      ],
      albedo: [
        'Albedo is a web wallet',
        'No installation required',
        'Works on all browsers and devices',
        'Just click connect to continue'
      ],
      lobstr: isMobile ? [
        'LOBSTR is a mobile app',
        'Download from App Store or Google Play',
        'Create or import a wallet',
        'Use WalletConnect to connect'
      ] : [
        isChrome ? 'Go to Chrome Web Store' : 
        isFirefox ? 'Go to Firefox Add-ons' :
        'Go to LOBSTR website',
        'Download the browser extension',
        'Install in your browser',
        'Create or import a wallet',
        'Return here and try again'
      ],
      rabet: isMobile ? [
        'Rabet is a browser extension',
        'Please use a desktop browser',
        'Or try Albedo (web wallet)',
        'No installation required for Albedo'
      ] : [
        isChrome ? 'Go to Chrome Web Store' : 
        isFirefox ? 'Go to Firefox Add-ons' :
        'Go to Rabet website',
        'Click "Install Extension"',
        'Add to your browser',
        'Create or import a wallet',
        'Return here and try again'
      ],
      xbull: [
        'xBull is a mobile wallet',
        'Download from App Store or Google Play',
        'Create or import a wallet',
        'Use WalletConnect to connect'
      ],
      hana: [
        'Hana is a mobile wallet',
        'Download from App Store or Google Play',
        'Create or import a wallet',
        'Use WalletConnect to connect'
      ]
    };

    return steps[wallet.id as keyof typeof steps] || [
      'Visit the wallet website',
      'Follow installation instructions',
      'Create or import a wallet',
      'Return here and try again'
    ];
  };

  const getWalletUrl = (wallet: WalletInfo) => {
    const { isMobile, isChrome, isFirefox, isSafari } = getBrowserInfo();
    
    const urls = {
      freighter: isMobile ? 'https://albedo.link/' :
        isChrome ? 'https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk' :
        isFirefox ? 'https://addons.mozilla.org/en-US/firefox/addon/freighter/' :
        isSafari ? 'https://apps.apple.com/app/freighter/id1576157386' :
        'https://freighter.app/',
      albedo: 'https://albedo.link/',
      lobstr: isMobile ? 'https://lobstr.co/app' :
        isChrome ? 'https://chromewebstore.google.com/detail/lobstr/ldiagbjmlmjiieclmdkagofdjcgodjle' :
        isFirefox ? 'https://addons.mozilla.org/en-US/firefox/addon/lobstr-vault/' :
        'https://lobstr.co',
      rabet: isMobile ? 'https://albedo.link/' :
        isChrome ? 'https://chromewebstore.google.com/detail/rabet/hgmoaheomcjnaheggkfafnjilfcefbmo' :
        isFirefox ? 'https://addons.mozilla.org/en-US/firefox/addon/rabet/' :
        'https://rabet.io/',
      xbull: 'https://xbull.app',
      hana: 'https://www.hanawallet.io/'
    };

    return urls[wallet.id as keyof typeof urls] || wallet.url;
  };

  const getQRCodeUrl = (wallet: WalletInfo) => {
    const url = getWalletUrl(wallet);
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
  };

  const isMobileWallet = (wallet: WalletInfo) => {
    return ['xbull', 'hana'].includes(wallet.id);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stellar-wallets-modal-title"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 id="stellar-wallets-modal-title" className="text-xl font-semibold text-gray-900 dark:text-white">
            Connect Stellar Wallet
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close Stellar wallet selection modal">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4 max-h-[calc(90vh-120px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8" role="status" aria-label="Loading wallets">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading wallets...</span>
            </div>
          ) : (
            <>
              {selectedWallet && !selectedWallet.isInstalled ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <img 
                      src={selectedWallet.icon} 
                      alt=""
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg"
                      onError={(e) => {
                        e.currentTarget.src = 'https://stellar.creit.tech/wallet-icons/default.png';
                      }}
                    />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedWallet.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Installation Guide</p>
                    </div>
                  </div>

                  <Card className="dark:border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-base text-gray-900 dark:text-white">Installation Steps</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-2 text-sm">
                        {getInstallationSteps(selectedWallet).map((step, index) => (
                          <li key={index} className="flex items-start space-x-2">
                            <span className="flex-shrink-0 w-5 h-5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-semibold">
                              {index + 1}
                            </span>
                            <span className="text-gray-700 dark:text-gray-300">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>

                  {/* QR Code for mobile wallets */}
                  {isMobileWallet(selectedWallet) && (
                    <Card className="mt-4 dark:border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center text-gray-900 dark:text-white">
                          <QrCode className="h-4 w-4 mr-2" aria-hidden="true" />
                          Scan to Download
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-center">
                        <img 
                          src={getQRCodeUrl(selectedWallet)} 
                          alt={`QR code to download ${selectedWallet.name}`}
                          className="mx-auto mb-3 border rounded-lg"
                        />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Scan with your mobile device to download {selectedWallet.name}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex space-x-3">
                    <Button 
                      onClick={() => window.open(getWalletUrl(selectedWallet), '_blank')}
                      className="flex-1"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                      {isMobileWallet(selectedWallet) ? 'Download App' : 
                       getBrowserInfo().isMobile ? 'Visit Website' : 'Download Extension'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setSelectedWallet(null)}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                /* Wallet List */
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose a wallet to connect to TrueStub
                  </p>
                  
                  {wallets.map((wallet) => (
                    <Card 
                      key={wallet.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${wallet.name} wallet, ${wallet.isInstalled ? 'installed' : 'not installed'}`}
                      className={`cursor-pointer bg-transparent transition-all duration-200 hover:shadow-md dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        wallet.isInstalled 
                          ? 'hover:ring-2 hover:ring-green-500' 
                          : 'hover:ring-2 hover:ring-blue-500'
                      }`}
                      onClick={() => handleWalletClick(wallet)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleWalletClick(wallet);
                        }
                      }}
                    >
                      <CardContent className="!p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <img 
                              src={wallet.icon} 
                              alt=""
                              aria-hidden="true"
                              className="w-8 h-8 rounded-lg"
                              onError={(e) => {
                                e.currentTarget.src = 'https://stellar.creit.tech/wallet-icons/default.png';
                              }}
                            />
                            <div>
                              <h3 className="font-semibold text-gray-900 dark:text-white">{wallet.name}</h3>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge 
                              variant={wallet.isInstalled ? "default" : "secondary"}
                              className={wallet.isInstalled 
                                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-100" 
                                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                              }
                            >
                              {wallet.isInstalled ? (
                                <>
                                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                                  Installed
                                </>
                              ) : (
                                <>
                                  <Download className="h-3 w-3 mr-1" aria-hidden="true" />
                                  Install
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
