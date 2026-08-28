import Capacitor
import Foundation
import StoreKit

/**
 * StoreKit 2 bridge.
 *
 * App Store Review Guideline 3.1.1 requires that the subscription unlocking
 * features inside the iOS app is sold through In-App Purchase. This plugin is
 * the whole native side of that: it lists products, runs the purchase sheet,
 * and hands the signed transaction (a JWS) back to the web layer, which posts
 * it to `/api/iap/apple` for verification.
 *
 * Two deliberate choices:
 *
 *  - The JWS is passed through untouched. Verification happens on the server,
 *    against Apple's certificate chain. A client that decides for itself
 *    whether a receipt is valid is a client that can be told to lie.
 *
 *  - A transaction is NOT finished here. It is finished only once the server
 *    has recorded it and the web layer calls `finish`. An unfinished
 *    transaction is re-delivered by StoreKit on the next launch, so a purchase
 *    made in a dead spot survives; one finished optimistically before the
 *    server heard about it is money taken for nothing.
 *
 * Add this file and ThermoRivetStoreKit.m to the Xcode project under
 * App/App/plugins/. Requires iOS 15 or later.
 */
@objc(ThermoRivetStoreKitPlugin)
public class ThermoRivetStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ThermoRivetStoreKitPlugin"
    public let jsName = "ThermoRivetStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    /// Transactions handed to the web layer but not yet confirmed by the server.
    private var pending: [String: Transaction] = [:]
    private let pendingQueue = DispatchQueue(label: "com.thermorivet.storekit.pending")

    private func remember(_ transaction: Transaction) {
        pendingQueue.sync { pending[String(transaction.id)] = transaction }
    }

    private func take(_ id: String) -> Transaction? {
        pendingQueue.sync {
            let found = pending[id]
            pending[id] = nil
            return found
        }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds is required.")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve([
                    "products": products.map { product in
                        [
                            "id": product.id,
                            "displayName": product.displayName,
                            "displayPrice": product.displayPrice
                        ]
                    }
                ])
            } catch {
                call.reject("Could not reach the App Store: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required.")
            return
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("That subscription is not available in your region's App Store.")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        self.remember(transaction)
                        call.resolve([
                            "signedTransaction": verification.jwsRepresentation,
                            "transactionId": String(transaction.id)
                        ])
                    case .unverified(_, let error):
                        // Apple itself could not vouch for this. Never forward it.
                        call.reject("The App Store could not verify that purchase: \(error.localizedDescription)")
                    }

                case .userCancelled:
                    // Not an error: the sheet was dismissed on purpose.
                    call.resolve(["signedTransaction": NSNull()])

                case .pending:
                    // Ask to Buy, or a payment awaiting approval. It will arrive
                    // through Transaction.updates later.
                    call.resolve(["signedTransaction": NSNull(), "pending": true])

                @unknown default:
                    call.resolve(["signedTransaction": NSNull()])
                }
            } catch {
                call.reject("The purchase could not be completed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            // Sync first so a reinstall on a fresh device sees the entitlement.
            try? await AppStore.sync()

            var signed: [String] = []
            for await entitlement in Transaction.currentEntitlements {
                if case .verified(let transaction) = entitlement {
                    self.remember(transaction)
                    signed.append(entitlement.jwsRepresentation)
                }
            }
            call.resolve(["signedTransactions": signed])
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId") else {
            call.reject("transactionId is required.")
            return
        }

        guard let transaction = take(id) else {
            // Already finished, or from a previous launch. Nothing to do, and
            // not worth failing the call over.
            call.resolve(["finished": false])
            return
        }

        Task {
            await transaction.finish()
            call.resolve(["finished": true])
        }
    }
}
